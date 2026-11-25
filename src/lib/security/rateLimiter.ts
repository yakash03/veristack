// VeriStack — Sliding-Window Per-Workspace/IP Rate Limiter

interface WindowBucket {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, WindowBucket>();
  private readonly maxTrackedKeys = 2000;

  checkLimit(
    key: string,
    windowMs: number,
    maxRequests: number
  ): { allowed: boolean; retryAfterSec: number; remaining: number } {
    const now = Date.now();
    const cutoff = now - windowMs;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxTrackedKeys) {
        const oldestKey = this.buckets.keys().next().value;
        if (oldestKey !== undefined) this.buckets.delete(oldestKey);
      }
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }

    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= maxRequests) {
      const oldestActive = bucket.timestamps[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldestActive + windowMs - now) / 1000));
      return { allowed: false, retryAfterSec, remaining: 0 };
    }

    bucket.timestamps.push(now);
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, maxRequests - bucket.timestamps.length),
    };
  }

  clear(): void {
    this.buckets.clear();
  }
}

const globalLimiter = globalThis as unknown as {
  __veristack_rate_limiter__?: SlidingWindowRateLimiter;
};
export const apiRateLimiter =
  globalLimiter.__veristack_rate_limiter__ ?? new SlidingWindowRateLimiter();
if (process.env.NODE_ENV !== "production") {
  globalLimiter.__veristack_rate_limiter__ = apiRateLimiter;
}
