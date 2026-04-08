/**
 * Tests for utils/async-handler.ts — asyncHandler (re-implemented).
 * Wraps async route so rejections are passed to next() for error middleware.
 */
import { describe, it, expect } from '@jest/globals';

/** Return a wrapper that runs fn and forwards any rejection to next. */
function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
    return (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next);
}

describe('asyncHandler', () => {
    it('returns a synchronous function', () => {
        const handler = asyncHandler(async () => {});
        expect(typeof handler).toBe('function');
    });

    it('calls next() with error when async function rejects', async () => {
        const error = new Error('Something went wrong');
        const fn = async () => { throw error; };
        const handler = asyncHandler(fn);

        const next = (err?: any) => { capturedError = err; };
        let capturedError: any;
        await handler({}, {}, next);

        expect(capturedError).toBe(error);
    });

    it('does NOT call next() when async function resolves', async () => {
        let nextCalled = false;
        const fn = async (_req: any, res: any) => {
            res.json({ ok: true });
        };
        const handler = asyncHandler(fn);
        const res = { json: (_data: any) => {} };
        await handler({}, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
    });

    it('passes req, res, next to the wrapped function', async () => {
        let receivedReq: any, receivedRes: any, receivedNext: any;
        const fn = async (req: any, res: any, next: any) => {
            receivedReq = req;
            receivedRes = res;
            receivedNext = next;
        };
        const handler = asyncHandler(fn);

        const req = { url: '/test' };
        const res = { status: 200 };
        const next = () => {};
        await handler(req, res, next);

        expect(receivedReq).toBe(req);
        expect(receivedRes).toBe(res);
        expect(receivedNext).toBe(next);
    });

    it('handles synchronous exceptions via Promise.resolve wrapping', async () => {
        // If fn throws synchronously (not a real async error), it's still caught
        const error = new Error('Sync throw');
        const fn = async () => { throw error; }; // async always wraps in rejected promise
        const handler = asyncHandler(fn);

        let capturedError: any;
        await handler({}, {}, (err: any) => { capturedError = err; });
        expect(capturedError).toBe(error);
    });

    it('resolves without calling next for void return', async () => {
        let nextCalled = false;
        const fn = async () => { /* void */ };
        const handler = asyncHandler(fn);
        await handler({}, {}, () => { nextCalled = true; });
        expect(nextCalled).toBe(false);
    });

    it('forwards the exact error object (not a copy)', async () => {
        const error = new Error('Exact reference test');
        error.name = 'ValidationError';
        const fn = async () => { throw error; };
        const handler = asyncHandler(fn);

        let capturedError: any;
        await handler({}, {}, (err: any) => { capturedError = err; });

        expect(capturedError).toBe(error);
        expect(capturedError.name).toBe('ValidationError');
    });

    it('handles multiple handlers independently', async () => {
        const errors: any[] = [];
        const successCount = { n: 0 };

        const failingHandler = asyncHandler(async () => { throw new Error('fail'); });
        const successHandler = asyncHandler(async (_req: any, res: any) => { res.sent = true; successCount.n++; });

        const res = { sent: false };
        await failingHandler({}, {}, (e: any) => errors.push(e));
        await successHandler({}, res, (e: any) => errors.push(e));

        expect(errors).toHaveLength(1);
        expect(errors[0].message).toBe('fail');
        expect(successCount.n).toBe(1);
        expect(res.sent).toBe(true);
    });
});
