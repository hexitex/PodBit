/**
 * Model concurrency + rate control — shared semaphore for all LLM call paths.
 *
 * Enforces THREE constraints per model:
 * 1. Max concurrent in-flight requests (maxConcurrency)
 * 2. Minimum pause between consecutive request dispatches (requestPauseMs)
 * 3. Rate-limit cooldown — when ANY caller gets a 429, ALL callers for that
 *    model wait until the cooldown expires before dispatching
 *
 * Without the pause, a semaphore of 3 can fire 30-60+ RPM if the model responds
 * quickly, hitting provider rate limits even though concurrency is respected.
 *
 * Separated from assignments.ts to avoid circular imports
 * (providers.ts ↔ assignments.ts).
 */

/**
 * Per-model semaphore enforcing concurrency limits, inter-request pause,
 * and shared rate-limit cooldown.
 *
 * Queue is FIFO -- waiters are resolved in the order they called acquire().
 *
 * The pause + cooldown are serialized via a dedicated pause queue so that
 * when maxConcurrency > 1, each caller reads the LATEST timing/cooldown
 * state one at a time, preventing simultaneous dispatch.
 */
class ModelSemaphore {
    private queue: (() => void)[] = [];
    private active = 0;
    private lastDispatchTime = 0;
    readonly maxConcurrency: number;
    readonly requestPauseMs: number;

    // Serializes the pause/cooldown section so only one caller computes timing at a time
    private pauseQueue: (() => void)[] = [];
    private pauseLocked = false;

    // Shared rate-limit cooldown — set by any caller that receives a 429,
    // respected by all subsequent callers for this model
    private _rateLimitedUntil = 0;

    /**
     * @param maxConcurrency - Maximum number of concurrent in-flight requests
     * @param requestPauseMs - Minimum milliseconds between consecutive dispatches (0 = no pause)
     */
    constructor(maxConcurrency: number, requestPauseMs: number = 0) {
        this.maxConcurrency = maxConcurrency;
        this.requestPauseMs = requestPauseMs;
    }

    /**
     * Acquire a concurrency slot. Blocks until a slot is available, the rate-limit
     * cooldown has passed, and the inter-request pause has elapsed.
     * Callers MUST call release() when done (use try/finally).
     */
    async acquire(): Promise<void> {
        // Wait for a concurrency slot
        if (this.active >= this.maxConcurrency) {
            await new Promise<void>(resolve => this.queue.push(resolve));
        }
        this.active++;

        // Enter the serialized timing section.
        // Handles both inter-request pause AND rate-limit cooldown.
        // Only one caller computes timing at a time — prevents concurrent
        // acquirers from reading stale state and dispatching simultaneously.
        const needsSerializedSection = this.requestPauseMs > 0 || this._rateLimitedUntil > Date.now();
        if (needsSerializedSection) {
            if (this.pauseLocked) {
                await new Promise<void>(resolve => this.pauseQueue.push(resolve));
            }
            this.pauseLocked = true;

            // Wait for rate-limit cooldown (checked under lock, so each
            // caller sees the latest value — including mid-flight updates)
            const cooldownRemaining = this._rateLimitedUntil - Date.now();
            if (cooldownRemaining > 0) {
                await new Promise<void>(r => setTimeout(r, cooldownRemaining));
            }

            // Enforce minimum pause between dispatches
            if (this.requestPauseMs > 0) {
                const now = Date.now();
                const elapsed = now - this.lastDispatchTime;
                if (elapsed < this.requestPauseMs) {
                    await new Promise<void>(r => setTimeout(r, this.requestPauseMs - elapsed));
                }
                this.lastDispatchTime = Date.now();
            }

            // Hand the lock to the next waiter (or release if none)
            const next = this.pauseQueue.shift();
            if (next) {
                // Next waiter inherits the lock — prevents new arrivals from
                // slipping in between unlock and the waiter's microtask
                next();
            } else {
                this.pauseLocked = false;
            }
        }
    }

    /** Release a concurrency slot and wake the next waiter in the queue, if any. */
    release(): void {
        this.active--;
        const next = this.queue.shift();
        if (next) next();
    }

    /**
     * Signal that this model returned a rate-limit error (429).
     * All callers currently queued or arriving in the future will wait
     * until the cooldown expires before dispatching.
     * @param waitMs - How long to cool down (typically parsed from the 429 response or a default backoff)
     */
    markRateLimited(waitMs: number): void {
        const until = Date.now() + waitMs;
        // Only extend — never shorten an existing cooldown
        if (until > this._rateLimitedUntil) {
            this._rateLimitedUntil = until;
        }
    }

    get pending(): number { return this.queue.length; }
    get activeCount(): number { return this.active; }
    get rateLimitedUntil(): number { return this._rateLimitedUntil; }
}

const semaphores = new Map<string, ModelSemaphore>();

/**
 * Get or create a semaphore for a model. If config has changed, replaces the existing semaphore.
 * @param modelId - Registry model UUID
 * @param maxConcurrency - Max concurrent requests
 * @param requestPauseMs - Minimum ms between dispatches
 * @returns The ModelSemaphore instance for this model
 */
function getSemaphore(modelId: string, maxConcurrency: number, requestPauseMs: number = 0): ModelSemaphore {
    let sem = semaphores.get(modelId);
    if (!sem || sem.maxConcurrency !== maxConcurrency || sem.requestPauseMs !== requestPauseMs) {
        sem = new ModelSemaphore(maxConcurrency, requestPauseMs);
        semaphores.set(modelId, sem);
    }
    return sem;
}

/**
 * Acquire a concurrency slot for a model. All code paths that call an LLM
 * should use this to respect the model's max_concurrency and request_pause_ms settings.
 *
 * Returns a release function — call it when the LLM call completes (in a finally block).
 */
export async function acquireModelSlot(modelId: string, maxConcurrency: number, requestPauseMs: number = 0): Promise<() => void> {
    const sem = getSemaphore(modelId, maxConcurrency, requestPauseMs);
    await sem.acquire();
    return () => sem.release();
}

/**
 * Try to acquire a concurrency slot without blocking.
 * Returns a release function if a slot was available, or null if all slots are full.
 * Also returns null if the model is currently rate-limited.
 */
export function tryAcquireModelSlot(modelId: string, maxConcurrency: number, requestPauseMs: number = 0): (() => void) | null {
    const sem = getSemaphore(modelId, maxConcurrency, requestPauseMs);
    if (sem.activeCount >= sem.maxConcurrency) return null;
    if (sem.rateLimitedUntil > Date.now()) return null;
    // Synchronously claim — safe because we checked capacity
    sem.acquire(); // resolves immediately since active < max
    return () => sem.release();
}

/**
 * Signal that a model returned a rate-limit error (429).
 * Propagates to ALL callers for this model — anyone currently queued
 * or arriving later will wait until the cooldown expires.
 *
 * @param modelId - Registry model UUID
 * @param waitMs - Cooldown duration in milliseconds
 */
export function reportRateLimit(modelId: string, waitMs: number): void {
    const sem = semaphores.get(modelId);
    if (sem) {
        sem.markRateLimited(waitMs);
    }
}

/**
 * Get current concurrency info for a model (for logging/diagnostics).
 * @param modelId - Registry model UUID
 * @returns Object with active count, pending queue length, max concurrency,
 *          and rate limit cooldown remaining (0 if not rate-limited), or null if no semaphore exists
 */
export function getModelConcurrencyInfo(modelId: string): { active: number; pending: number; max: number; cooldownMs: number } | null {
    const sem = semaphores.get(modelId);
    if (!sem) return null;
    return {
        active: sem.activeCount,
        pending: sem.pending,
        max: sem.maxConcurrency,
        cooldownMs: Math.max(0, sem.rateLimitedUntil - Date.now()),
    };
}
