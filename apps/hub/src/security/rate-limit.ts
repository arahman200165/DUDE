import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { envelope } from '../server/errors.js';
import { isApiPath } from './headers.js';
import { classifyCredential } from './request-guard.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Opt a route into the stricter credential-endpoint bucket. */
    authLimited?: boolean;
  }
}

export interface BucketPolicy { perMinute: number; burst: number }

/** Per principal (session or device) for authenticated routes, and per client address for credential-less requests. */
export const GLOBAL_POLICY: BucketPolicy = { perMinute: 300, burst: 60 };
/** Credential endpoints (sign-in, recovery, enrolment): per client address. */
export const AUTH_POLICY: BucketPolicy = { perMinute: 20, burst: 10 };
/** Per principal for web read routes (`GET /api/v1/web/*`, `GET /api/v1/sync/changes`). */
export const READ_POLICY: BucketPolicy = { perMinute: 600, burst: 120 };
/** Per client address for ALL API traffic: a generous flood guard that runs before any credential is checked. */
export const FLOOD_POLICY: BucketPolicy = { perMinute: 1200, burst: 240 };

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
  /** Early, per client address. `anonymous` = the request presents no credential. Seconds to wait, or 0. */
  checkAddress(ip: string, kind: { authLimited: boolean; anonymous: boolean }): number;
  /** After authentication, per principal key (`owner:<session>` or `device:<id>`). Seconds to wait, or 0. */
  checkPrincipal(key: string, read: boolean): number;
  /** True when the most recent `checkAddress` rejection came from the per-address flood bucket. */
  readonly lastRejectionWasFlood: boolean;
  sweep(): void;
  readonly size: number;
}

export interface RateLimiterOptions {
  now?: () => number;
  /** Credential-less requests (per address) and authenticated requests (per principal). */
  global?: BucketPolicy;
  auth?: BucketPolicy;
  read?: BucketPolicy;
  flood?: BucketPolicy;
}

export function createRateLimiter(options: RateLimiterOptions = {}): RateLimiter {
  const now = options.now ?? Date.now;
  const flood = new TokenBuckets(options.flood ?? FLOOD_POLICY);
  const anonymous = new TokenBuckets(options.global ?? GLOBAL_POLICY);
  const auth = new TokenBuckets(options.auth ?? AUTH_POLICY);
  const principal = new TokenBuckets(options.global ?? GLOBAL_POLICY);
  const read = new TokenBuckets(options.read ?? READ_POLICY);
  let lastFlood = false;
  return {
    get lastRejectionWasFlood() { return lastFlood; },
    checkAddress(ip, kind) {
      const t = now();
      const wait = flood.take(ip, t);
      lastFlood = wait > 0;
      if (wait > 0) return wait;
      if (!kind.anonymous && !kind.authLimited) return 0; // an authenticated request is metered per principal later
      const global = anonymous.take(ip, t);
      if (global > 0) return global;
      return kind.authLimited ? auth.take(ip, t) : 0;
    },
    checkPrincipal(key, isRead) {
      return (isRead ? read : principal).take(key, now());
    },
    sweep() {
      const t = now();
      for (const buckets of [flood, anonymous, auth, principal, read]) buckets.sweep(t);
    },
    get size() { return flood.size + anonymous.size + auth.size + principal.size + read.size; },
  };
}

function tooMany(reply: FastifyReply, wait: number): FastifyReply {
  return reply
    .code(429)
    .type('application/json')
    .header('Retry-After', String(wait))
    .header('Cache-Control', 'no-store')
    .send(envelope('rate-limited', 'Too many requests. Try again later.'));
}

/**
 * Per-address flood guard plus the credential-less/auth buckets. The address is `request.ip`: the socket peer, or, in
 * reverse-proxy mode and only for a configured trusted proxy, the client address from `X-Forwarded-For`. Authenticated
 * requests are metered per principal by `withPrincipalLimit` after auth. Idle keys are swept periodically.
 */
export function registerRateLimit(app: FastifyInstance, limiter: RateLimiter, sweepIntervalMs = 60_000, options: { onFlood?: (ip: string) => void } = {}): void {
  app.addHook('onRequest', async (request, reply) => {
    // The public web bundle is dozens of module requests per page load; only API calls consume tokens.
    if (!isApiPath(request.url)) return;
    const ip = request.ip || 'unknown';
    const wait = limiter.checkAddress(ip, {
      authLimited: request.routeOptions.config?.authLimited === true,
      anonymous: classifyCredential(request).kind === 'none',
    });
    if (wait === 0) return;
    if (limiter.lastRejectionWasFlood) options.onFlood?.(ip);
    return tooMany(reply, wait);
  });
  const timer = setInterval(() => limiter.sweep(), sweepIntervalMs);
  timer.unref();
  app.addHook('onClose', async () => { clearInterval(timer); });
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `withPrincipalLimit` once auth resolved the principal (`owner:<session hash>` or `device:<id>`). */
    principalKey?: string;
  }
}

const READ_PATHS = ['/api/v1/web/', '/api/v1/sync/changes'];

/** GET routes under `/api/v1/web/` and `/api/v1/sync/changes` use the higher read policy. */
export function isReadRoute(request: Pick<FastifyRequest, 'method' | 'url'>): boolean {
  if (request.method !== 'GET') return false;
  const pathname = request.url.split('?')[0] ?? '/';
  return READ_PATHS.some((prefix) => (prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix));
}

type Resolver = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

/**
 * Wraps an auth preHandler (`requireOwner`, `requireDevice`): after it attaches the principal, the request is metered
 * against that principal's bucket (once per request). A failed authentication is not metered here: the per-address flood
 * guard already ran for it.
 */
export function withPrincipalLimit(limiter: RateLimiter, resolve: Resolver, keyOf: (request: FastifyRequest) => string | undefined): Resolver {
  return async (request, reply) => {
    const failed = await resolve(request, reply);
    if (failed !== undefined) return failed;
    const key = keyOf(request);
    if (key === undefined || request.principalKey !== undefined) return undefined;
    request.principalKey = key;
    const wait = limiter.checkPrincipal(key, isReadRoute(request));
    return wait > 0 ? tooMany(reply, wait) : undefined;
  };
}
