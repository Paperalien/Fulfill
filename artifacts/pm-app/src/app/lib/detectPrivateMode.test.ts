import { describe, it, expect, afterEach, vi } from 'vitest';
import { detectPrivateMode, PRIVATE_QUOTA_CEILING_BYTES } from './detectPrivateMode';

// Swap navigator.storage.estimate for a controllable stub.
function stubEstimate(impl: (() => Promise<{ quota?: number }>) | undefined) {
  const storage = impl === undefined ? undefined : { estimate: impl };
  Object.defineProperty(navigator, 'storage', {
    value: storage,
    configurable: true,
  });
}

afterEach(() => {
  // Remove our override so other suites see the real navigator.
  delete (navigator as { storage?: unknown }).storage;
});

describe('detectPrivateMode', () => {
  it('returns true when the quota is below the private ceiling', async () => {
    stubEstimate(async () => ({ quota: PRIVATE_QUOTA_CEILING_BYTES - 1 }));
    expect(await detectPrivateMode()).toBe(true);
  });

  it('returns false when the quota is at or above the ceiling', async () => {
    stubEstimate(async () => ({ quota: PRIVATE_QUOTA_CEILING_BYTES }));
    expect(await detectPrivateMode()).toBe(false);

    stubEstimate(async () => ({ quota: 50 * 1024 * 1024 * 1024 })); // 50 GB
    expect(await detectPrivateMode()).toBe(false);
  });

  it('returns false when the Storage API is unavailable', async () => {
    stubEstimate(undefined);
    expect(await detectPrivateMode()).toBe(false);
  });

  it('returns false when estimate() omits a numeric quota', async () => {
    stubEstimate(async () => ({}));
    expect(await detectPrivateMode()).toBe(false);
  });

  it('returns false (never throws) when estimate() rejects', async () => {
    stubEstimate(async () => {
      throw new Error('boom');
    });
    expect(await detectPrivateMode()).toBe(false);
  });
});
