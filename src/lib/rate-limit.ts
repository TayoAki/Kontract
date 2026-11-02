// Per-key sliding-window limits, held in memory (one server process). Used
// to keep an AI assistant from looping on tools that call paid or slow
// outside services.

export interface Limiter {
  /** Count one use for `key`. Returns null when allowed, or the seconds until it would be. */
  take(key: string, now?: number): number | null;
}

export function createLimiter(max: number, windowMs: number): Limiter {
  const hits = new Map<string, number[]>();
  return {
    take(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return Math.ceil((recent[0]! + windowMs - now) / 1000);
      }
      recent.push(now);
      hits.set(key, recent);
      return null;
    },
  };
}
