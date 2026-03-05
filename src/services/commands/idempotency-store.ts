interface IdempotencyRecord<T> {
  value: T;
  expiresAt: number;
}

interface IdempotencyStoreOptions {
  ttlMs: number;
  maxEntries: number;
}

export class IdempotencyStore<T> {
  private readonly records = new Map<string, IdempotencyRecord<T>>();

  constructor(private readonly options: IdempotencyStoreOptions) {}

  get(key: string): T | undefined {
    this.purgeExpired();

    const record = this.records.get(key);
    if (!record) {
      return undefined;
    }

    return record.value;
  }

  set(key: string, value: T): void {
    this.purgeExpired();
    this.enforceCapacity();

    this.records.set(key, {
      value,
      expiresAt: Date.now() + this.options.ttlMs,
    });
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (record.expiresAt <= now) {
        this.records.delete(key);
      }
    }
  }

  private enforceCapacity(): void {
    if (this.records.size < this.options.maxEntries) {
      return;
    }

    const oldestKey = this.records.keys().next().value as string | undefined;
    if (oldestKey) {
      this.records.delete(oldestKey);
    }
  }
}
