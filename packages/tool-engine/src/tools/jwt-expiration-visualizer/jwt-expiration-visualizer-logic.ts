/**
 * Pure, framework-free timeline math for an already-decoded JWT payload,
 * used by the JWT Expiration Visualizer tool. Places iat/nbf/exp on a
 * timeline relative to `now` and computes how much of the token's
 * lifetime has elapsed.
 */

export type JwtTimelineStatus = 'not-yet-valid' | 'active' | 'expired' | 'no-expiry';

export interface JwtTimeline {
  readonly iat?: Date;
  readonly nbf?: Date;
  readonly exp?: Date;
  readonly status: JwtTimelineStatus;
  readonly totalLifetimeMs?: number;
  readonly remainingMs?: number;
  readonly percentElapsed?: number;
}

export type TimelineResult = { readonly ok: true; readonly timeline: JwtTimeline } | { readonly ok: false; readonly error: string };

function numberClaim(record: Record<string, unknown>, claim: string): number | undefined {
  return typeof record[claim] === 'number' ? (record[claim] as number) : undefined;
}

export function buildTimeline(payload: unknown, now: Date = new Date()): TimelineResult {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, error: 'Payload is not a JSON object.' };
  }

  const p = payload as Record<string, unknown>;
  const iat = numberClaim(p, 'iat');
  const nbf = numberClaim(p, 'nbf');
  const exp = numberClaim(p, 'exp');

  if (iat === undefined && nbf === undefined && exp === undefined) {
    return { ok: true, timeline: { status: 'no-expiry' } };
  }

  const iatDate = iat !== undefined ? new Date(iat * 1000) : undefined;
  const nbfDate = nbf !== undefined ? new Date(nbf * 1000) : undefined;
  const expDate = exp !== undefined ? new Date(exp * 1000) : undefined;

  let status: JwtTimelineStatus;
  if (expDate && expDate.getTime() <= now.getTime()) status = 'expired';
  else if (nbfDate && nbfDate.getTime() > now.getTime()) status = 'not-yet-valid';
  else if (expDate) status = 'active';
  else status = 'no-expiry';

  const startDate = nbfDate ?? iatDate;
  let totalLifetimeMs: number | undefined;
  let remainingMs: number | undefined;
  let percentElapsed: number | undefined;

  if (expDate) {
    remainingMs = expDate.getTime() - now.getTime();
    if (startDate) {
      const lifetime = expDate.getTime() - startDate.getTime();
      if (lifetime > 0) {
        totalLifetimeMs = lifetime;
        const elapsed = now.getTime() - startDate.getTime();
        percentElapsed = Math.min(100, Math.max(0, (elapsed / lifetime) * 100));
      }
    }
  }

  return { ok: true, timeline: { iat: iatDate, nbf: nbfDate, exp: expDate, status, totalLifetimeMs, remainingMs, percentElapsed } };
}
