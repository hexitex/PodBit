/**
 * Unit tests for models/semaphore.ts — model concurrency control.
 *
 * Pure in-memory semaphore — no DB or external deps.
 */
import { describe, it, expect } from '@jest/globals';

import { acquireModelSlot, getModelConcurrencyInfo } from '../../models/semaphore.js';

describe('acquireModelSlot', () => {
  it('acquires and releases a slot', async () => {
    const release = await acquireModelSlot('test-model-1', 3);
    const info = getModelConcurrencyInfo('test-model-1');
    expect(info).not.toBeNull();
    expect(info!.active).toBe(1);
    expect(info!.max).toBe(3);
    release();
    const infoAfter = getModelConcurrencyInfo('test-model-1');
    expect(infoAfter!.active).toBe(0);
  });

  it('respects max concurrency', async () => {
    const modelId = 'test-model-2';
    const maxC = 2;
    const r1 = await acquireModelSlot(modelId, maxC);
    const r2 = await acquireModelSlot(modelId, maxC);

    const info = getModelConcurrencyInfo(modelId);
    expect(info!.active).toBe(2);

    // Third acquire should queue
    let thirdAcquired = false;
    const p3 = acquireModelSlot(modelId, maxC).then(r => {
      thirdAcquired = true;
      return r;
    });

    // Allow microtasks to settle
    await new Promise(r => setTimeout(r, 10));
    expect(thirdAcquired).toBe(false);
    expect(getModelConcurrencyInfo(modelId)!.pending).toBe(1);

    // Release one slot — third should now acquire
    r1();
    await new Promise(r => setTimeout(r, 10));
    expect(thirdAcquired).toBe(true);

    const r3 = await p3;
    r2();
    r3();
  });

  it('returns null info for unknown models', () => {
    expect(getModelConcurrencyInfo('nonexistent-model')).toBeNull();
  });
});

describe('getModelConcurrencyInfo', () => {
  it('reports pending queue length', async () => {
    const modelId = 'test-model-3';
    const r1 = await acquireModelSlot(modelId, 1);

    // Queue two more
    const p2 = acquireModelSlot(modelId, 1);
    const p3 = acquireModelSlot(modelId, 1);

    await new Promise(r => setTimeout(r, 10));
    const info = getModelConcurrencyInfo(modelId);
    expect(info!.active).toBe(1);
    expect(info!.pending).toBe(2);

    // Clean up
    r1();
    const r2 = await p2;
    r2();
    const r3 = await p3;
    r3();
  });
});
