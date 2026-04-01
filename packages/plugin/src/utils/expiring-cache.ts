interface ExpiringCacheOptions {
  maxSize: number;
  ttlMs: number;
}

interface ExpiringCacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class ExpiringCache<TKey, TValue> {
  private readonly entries = new Map<TKey, ExpiringCacheEntry<TValue>>();

  public constructor(private readonly options: ExpiringCacheOptions) {}

  public get(key: TKey): TValue | undefined {
    const cached = this.entries.get(key);
    if (!cached) {
      return undefined;
    }

    if (cached.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    // Move to end for LRU ordering
    this.entries.delete(key);
    this.entries.set(key, cached);

    return cached.value;
  }

  public set(key: TKey, value: TValue) {
    this.pruneExpired();
    this.entries.set(key, {
      expiresAt: Date.now() + this.options.ttlMs,
      value,
    });

    while (this.entries.size > this.options.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.entries.delete(oldestKey);
    }
  }

  public clear() {
    this.entries.clear();
  }

  private pruneExpired() {
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}
