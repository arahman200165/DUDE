import { HubAdminError, type HubStatus } from '../../../../core/hub/hub-admin.port';
import type { StatusGlyphKind } from '../../../../shared/components/status-glyph/status-glyph';

export type HubConnectionKind = 'standalone' | 'connecting' | 'online' | 'offline' | 'revoked' | 'incompatible' | 'untrusted-tls';

export interface HubConnectionCopy {
  readonly label: string;
  readonly glyph: StatusGlyphKind;
  /** Theme-token text class for the badge. */
  readonly tone: string;
  /** Plain copy that says what is going on and what to do. */
  readonly detail: string;
}

export const HUB_CONNECTION_COPY: Readonly<Record<HubConnectionKind, HubConnectionCopy>> = {
  standalone: { label: 'Standalone', glyph: 'idle', tone: 'text-text-muted', detail: 'This device is not connected to a Hub. Paste a pairing string below to connect it.' },
  connecting: { label: 'Connecting', glyph: 'busy', tone: 'text-info', detail: 'Connecting to the Hub. This usually takes a few seconds.' },
  online: { label: 'Online', glyph: 'success', tone: 'text-success', detail: 'This device is connected to its Hub.' },
  offline: { label: 'Offline', glyph: 'offline', tone: 'text-warning', detail: 'The Hub cannot be reached right now. Check that the Hub is running and on the same network; DUDE keeps retrying.' },
  revoked: { label: 'Revoked by the Hub', glyph: 'error', tone: 'text-error', detail: 'This device was revoked. Pair it again to reconnect.' },
  incompatible: { label: 'Incompatible version', glyph: 'warning', tone: 'text-warning', detail: 'This DUDE and the Hub cannot talk to each other. Update whichever one is older, then this reconnects by itself.' },
  'untrusted-tls': { label: 'Untrusted Hub certificate', glyph: 'error', tone: 'text-error', detail: "The Hub's certificate no longer matches. Pair again with a fresh pairing string." },
};

export function connectionKind(status: HubStatus): HubConnectionKind {
  if (status.enrollmentState === 'standalone') return 'standalone';
  if (status.enrollmentState === 'revoked') return 'revoked';
  if (status.connection !== undefined) return status.connection;
  return status.reachable === true ? 'online' : status.reachable === false ? 'offline' : 'connecting';
}

const ERROR_COPY: Readonly<Record<string, string>> = {
  'tls-pin-mismatch': "The Hub's certificate does not match the pairing string. Create a fresh pairing string on the Hub and try again.",
  'pairing-rejected': 'The Hub rejected the pairing code. It may have expired or already been used. Create a new one.',
  'hub-unreachable': 'The Hub could not be reached. Check the address and that the Hub is running, then try again.',
  incompatible: 'This DUDE and the Hub are different versions that cannot talk to each other. Update whichever is older.',
  'already-enrolled': 'This device is already connected to a Hub. Disconnect it first to connect to another.',
  'dpapi-unavailable': "Windows could not protect this device's credentials (DPAPI is unavailable), so it cannot be paired.",
  'invalid-pairing-string': 'That is not a valid pairing string.',
  conflict: 'Another change is in progress. Try again in a moment.',
  'owner-session-expired': 'Your owner session expired. Sign in again.',
  'owner-not-signed-in': 'Sign in as the environment owner first.',
  'tls-untrusted': "The Hub's certificate no longer matches. Pair again with a fresh pairing string.",
};

export const OWNER_EXPIRED_CODES: readonly string[] = ['owner-session-expired', 'owner-not-signed-in'];

export function retryText(ms: number | undefined): string {
  if (ms === undefined || ms <= 0) return '';
  const seconds = Math.ceil(ms / 1000);
  return seconds >= 120 ? ` Try again in ${Math.ceil(seconds / 60)} minutes.` : ` Try again in ${seconds} seconds.`;
}

/** Turns any failure into one plain sentence; codes that mean something specific get specific copy, the rest keep the port's own message. */
export function hubErrorText(error: unknown, fallback = 'That did not work. Try again.'): string {
  if (error instanceof HubAdminError) {
    const base = ERROR_COPY[error.code] ?? (error.message.trim() !== '' ? error.message : fallback);
    return `${base}${retryText(error.retryAfterMs)}`;
  }
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}

export const shortId = (id: string | null): string => (id === null ? '' : id.length > 8 ? id.slice(0, 8) : id);

/** `AAAA BBBB ...` so a 43-character pin can be compared by eye. */
export function groupFingerprint(spki: string): string {
  return spki.match(/.{1,4}/g)?.join(' ') ?? spki;
}

export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (iso === null) return 'Never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'Unknown';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
