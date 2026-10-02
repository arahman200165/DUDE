import type { FastifyInstance } from 'fastify';
import { envelope } from '../server/errors.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Opt a route into the stricter credential-endpoint bucket. */
    authLimited?: boolean;
  }
}

export interface BucketPolicy { perMinute: number; burst: number }

export const GLOBAL_POLICY: BucketPolicy = { perMinute: 300, burst: 60 };
export const AUTH_POLICY: BucketPolicy = { perMinute: 20, burst: 10 };

interface Bucket { tokens: number; at: number }

class TokenBuckets {
  private readonly buckets = new Map<string, Bucket>();
  constructor(private readonly policy: BucketPolicy) {}

  /** Returns 0 when allowed, otherwise the whole seconds to wait. */
  take(key: string, now: number): number {
    const ratePerMs = this.policy.perMinute / 60_000;
    const bucket = this.buckets.get(key) ?? { tokens: this.policy.burst, at: now };
    bucket.tokens = Math.min(this.policy.burst, bucket.tokens + Math.max(0, now - bucket.at) * ratePerMs);
    bucket.at = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }
    return Math.max(1, Math.ceil((1 - bucket.tokens) / ratePerMs / 1000));
  }

  /** Drops keys that have refilled completely (they carry no state). */
  sweep(now: number): void {
    const fullMs = (this.policy.burst / this.policy.perMinute) * 60_000;
    for (const [key, bucket] of this.buckets) if (now - bucket.at >= fullMs) this.buckets.delete(key);
  }

  get size(): number { return this.buckets.size; }
}

export interface RateLimiter {
  /** Seconds to wait, or 0 when the request may proceed. */
  check(ip: string, authLimited: boolean): number;
  sweep(): void;
  readonly size: number;
}

export interface RateLimiterOptions {
  now?: () => number;
  global?: BucketPolicy;
  auth?: BucketPolicy;
}

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const now = options.now ?? Date.now;
  const global = new TokenBuckets(options.global ?? GLOBAL_POLICY);
  const auth = new TokenBuckets(options.auth ?? AUTH_POLICY);
  return {
    check(ip, authLimited) {
      const t = now();
      const wait = global.take(ip, t);
      if (wait > 0) return wait;
      return authLimited ? auth.take(ip, t) : 0;
    },
    sweep() {
      const t = now();
      global.sweep(t);
      auth.sweep(t);
    },
    get size() { return global.size + auth.size; },
  };
}

/** Keyed by `socket.remoteAddress` (trustProxy is off). Idle keys are swept periodically. */
export function registerRateLimit(app: FastifyInstance, limiter: RateLimiter, sweepIntervalMs = 60_000): void {
  app.addHook('onRequest', async (request, reply) => {
    const wait = limiter.check(request.socket.remoteAddress ?? 'unknown', request.routeOptions.config?.authLimited === true);
    if (wait === 0) return;
    return reply
      .code(429)
      .type('application/json')
      .header('Retry-After', String(wait))
      .header('Cache-Control', 'no-store')
      .send(envelope('rate-limited', 'Too many requests. Try again later.'));
  });
  const timer = setInterval(() => limiter.sweep(), sweepIntervalMs);
  timer.unref();
  app.addHook('onClose', async () => { clearInterval(timer); });
}
