import { computeBackoffDelay } from '../../src/core/domain/retry';

describe('computeBackoffDelay', () => {
  it('uses deterministic exponential backoff when jitter is disabled', () => {
    const delay1 = computeBackoffDelay(
      1,
      {
        initialDelayMs: 1000,
        maxDelayMs: 60_000,
        multiplier: 2,
        jitterRatio: 0,
      },
      () => 0.5,
    );
    const delay2 = computeBackoffDelay(
      2,
      {
        initialDelayMs: 1000,
        maxDelayMs: 60_000,
        multiplier: 2,
        jitterRatio: 0,
      },
      () => 0.5,
    );

    expect(delay1).toBe(1000);
    expect(delay2).toBe(2000);
  });

  it('caps backoff at maxDelayMs', () => {
    const delay = computeBackoffDelay(
      20,
      {
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        multiplier: 2,
        jitterRatio: 0,
      },
      () => 0.5,
    );

    expect(delay).toBe(5000);
  });
});
