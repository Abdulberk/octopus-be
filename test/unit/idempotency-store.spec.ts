import { IdempotencyStore } from '../../src/services/commands/idempotency-store';

describe('IdempotencyStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns value before ttl expiration and purges expired entries', () => {
    const store = new IdempotencyStore<string>({
      ttlMs: 1_000,
      maxEntries: 10,
    });

    store.set('key-1', 'value-1');
    expect(store.get('key-1')).toBe('value-1');

    jest.advanceTimersByTime(1_001);
    expect(store.get('key-1')).toBeUndefined();
  });

  it('evicts oldest entry when max capacity is reached', () => {
    const store = new IdempotencyStore<string>({
      ttlMs: 10_000,
      maxEntries: 2,
    });

    store.set('a', 'A');
    store.set('b', 'B');
    store.set('c', 'C');

    expect(store.get('a')).toBeUndefined();
    expect(store.get('b')).toBe('B');
    expect(store.get('c')).toBe('C');
  });
});
