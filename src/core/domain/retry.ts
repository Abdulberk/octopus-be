export interface RetryPolicy {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitterRatio: number;
  maxAttempts?: number;
}

export function computeBackoffDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  const base =
    policy.initialDelayMs * policy.multiplier ** Math.max(0, attempt - 1);
  const clamped = Math.min(base, policy.maxDelayMs);
  const jitterFactor = 1 + policy.jitterRatio * (random() * 2 - 1);
  const delayed = clamped * jitterFactor;

  return Math.max(0, Math.round(delayed));
}
