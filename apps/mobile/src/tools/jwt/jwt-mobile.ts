import { decodeTemporalClaim, type JwtExpiryStatus } from '@dude/tool-engine/tools/jwt/jwt-decode';
import type { KeyValueRow } from '../../kit';

export type PillTone = 'success' | 'error' | 'info' | 'warning';
export interface ExpiryPill { readonly label: string; readonly tone: PillTone }

const DAY = 86_400_000;
const UNITS: readonly (readonly [string, number])[] = [
  ['year', 365 * DAY], ['month', 30 * DAY], ['day', DAY], ['hour', 3_600_000], ['minute', 60_000], ['second', 1000],
];

/** "in 3 days" / "2 years ago": the largest whole unit, so it is approximate by design. */
export function relativeTime(target: Date, now: Date): string {
  const diff = target.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const unit = UNITS.find(([, size]) => abs >= size);
  if (!unit) return 'now';
  const count = Math.floor(abs / unit[1]);
  const text = `${count} ${unit[0]}${count === 1 ? '' : 's'}`;
  return diff < 0 ? `${text} ago` : `in ${text}`;
}

const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime());

/** Status pill text: the words carry the meaning, the tone only reinforces it. */
export function expiryPill(expiry: JwtExpiryStatus, now: Date): ExpiryPill {
  if (expiry.kind === 'no-claim') return { label: 'No exp claim', tone: 'info' };
  if (!isValidDate(expiry.expiresAt)) return { label: 'exp claim is out of range', tone: 'warning' };
  const when = relativeTime(expiry.expiresAt, now);
  return expiry.kind === 'expired' ? { label: `Expired ${when}`, tone: 'error' } : { label: `Valid, expires ${when}`, tone: 'success' };
}

/** Full UTC instant, e.g. 2018-01-18T01:30:22.000Z; the raw claim number when the date is out of range. */
export function formatInstant(date: Date, raw: unknown): string {
  return isValidDate(date) ? date.toISOString() : String(raw);
}

const TEMPORAL = ['exp', 'nbf', 'iat'] as const;
const TEMPORAL_LABEL = { exp: 'exp (expires)', nbf: 'nbf (not before)', iat: 'iat (issued at)' } as const;
const STANDARD = ['iss', 'sub', 'aud', 'jti'] as const;
const HEADER_LABEL = { alg: 'Algorithm (alg)', typ: 'Type (typ)', kid: 'Key ID (kid)' } as const;
const scalar = (value: unknown): string => typeof value === 'string' ? value : JSON.stringify(value);

/** Header facts (alg, typ, kid), standard claims, human times for exp/nbf/iat, then custom claims as `claim-<name>`. */
export function claimRows(header: unknown, payload: unknown): readonly KeyValueRow[] {
  const rows: KeyValueRow[] = [];
  const head = header && typeof header === 'object' ? header as Record<string, unknown> : {};
  for (const key of ['alg', 'typ', 'kid'] as const) if (key in head) rows.push({ key, label: HEADER_LABEL[key], value: scalar(head[key]) });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return rows;
  const body = payload as Record<string, unknown>;
  for (const key of STANDARD) if (key in body) rows.push({ key, label: key, value: scalar(body[key]) });
  for (const key of TEMPORAL) {
    const date = decodeTemporalClaim(body, key);
    if (date) rows.push({ key, label: TEMPORAL_LABEL[key], value: formatInstant(date, body[key]) });
    else if (key in body) rows.push({ key, label: key, value: scalar(body[key]) });
  }
  const known = new Set<string>([...STANDARD, ...TEMPORAL]);
  for (const key of Object.keys(body)) if (!known.has(key)) rows.push({ key: `claim-${key}`, label: key, value: scalar(body[key]) });
  return rows;
}
