import type { AgentDiagnostics, AgentDiagnosticsState } from '@dude/contracts';
import type { DiagnosticBasis, DiagnosticStatus, HubDiagnosticsReport, ReachabilityScope } from '@dude/contracts/hub';
import type { StatusGlyphKind } from '../../../../shared/components/status-glyph/status-glyph';

export interface CheckTone {
  readonly label: string;
  readonly glyph: StatusGlyphKind;
  /** Theme-token text class. */
  readonly tone: string;
}

export const CHECK_TONE: Readonly<Record<DiagnosticStatus, CheckTone>> = {
  pass: { label: 'Pass', glyph: 'success', tone: 'text-success' },
  warn: { label: 'Warning', glyph: 'warning', tone: 'text-warning' },
  fail: { label: 'Fail', glyph: 'error', tone: 'text-error' },
  info: { label: 'Info', glyph: 'info', tone: 'text-info' },
};

export const BASIS_LABEL: Readonly<Record<DiagnosticBasis, string>> = {
  verified: 'Verified',
  claimed: 'Operator-claimed',
  'not-checked': 'Not checked',
};

/** The observed source scope of a reachability echo, in words (the address itself is never shown). */
export const REACHABILITY_SCOPE_WORDS: Readonly<Record<ReachabilityScope, string>> = {
  public: 'a public Internet address',
  private: 'a private network address',
  cgnat: 'a carrier-grade NAT address',
  'link-local': 'a link-local address',
  'unique-local': 'a private IPv6 address',
  loopback: 'the Hub machine itself',
  unknown: 'an address the Hub could not classify',
};

export const SOURCE_LABEL: Readonly<Record<'self-signed' | 'local-ca' | 'imported' | 'acme', string>> = {
  'self-signed': 'Self-signed',
  'local-ca': 'Local CA',
  imported: 'Imported',
  acme: 'ACME (public CA)',
};

export const BIND_LABEL: Readonly<Record<HubDiagnosticsReport['exposure']['bind'], string>> = {
  loopback: 'Loopback only',
  lan: 'Local network',
  container: 'Container',
};

export const AGENT_STATE_COPY: Readonly<Record<AgentDiagnosticsState, { readonly label: string; readonly glyph: StatusGlyphKind; readonly tone: string; readonly detail: string }>> = {
  standalone: { label: 'Standalone', glyph: 'idle', tone: 'text-text-muted', detail: 'This device is not connected to a Hub.' },
  enrolled: { label: 'Connected', glyph: 'success', tone: 'text-success', detail: 'The Hub answered over the pinned connection.' },
  unreachable: { label: 'Unreachable', glyph: 'offline', tone: 'text-warning', detail: 'The Hub did not answer. Check that it is running and on this network.' },
  'untrusted-certificate': { label: 'Untrusted certificate', glyph: 'error', tone: 'text-error', detail: "The Hub's certificate does not match this device's pins. Pair again with a fresh pairing string." },
  incompatible: { label: 'Incompatible version', glyph: 'warning', tone: 'text-warning', detail: 'This DUDE and the Hub cannot talk to each other. Update whichever is older.' },
  revoked: { label: 'Revoked', glyph: 'error', tone: 'text-error', detail: 'The Hub revoked this device. Pair it again to reconnect.' },
};

export const SKEW_WARN_SECONDS = 60;

export const isSkewed = (seconds: number | null): boolean => seconds !== null && Math.abs(seconds) > SKEW_WARN_SECONDS;

export const daysLeftTone = (days: number): 'text-error' | 'text-warning' | 'text-text' => (days < 0 ? 'text-error' : days <= 30 ? 'text-warning' : 'text-text');

/** `Run elevated:` blocks only make sense for a command; trims stray whitespace and keeps it one copyable string. */
export const fixCommand = (fix: string | undefined): string | null => {
  const text = fix?.trim();
  return text === undefined || text === '' ? null : text;
};

const SECRET_KEY = /token|secret|password|passphrase|authorization|cookie/i;

/** Query string and fragment never belong in a pasted report. */
export function stripUrlQuery(value: string): string {
  return value.replace(/^([a-z][a-z0-9+.-]*:\/\/[^?#\s]*)[?#]\S*$/i, '$1');
}

/**
 * Defensive scrub of a report before it is copied: drops any field named like a credential and strips the query
 * string of every `hubUrl`. Both source reports are already secret-free; this keeps it that way if one grows a field.
 */
export function redactReport<T>(value: T): T {
  const walk = (node: unknown, key: string | null): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item, null));
    if (typeof node === 'object' && node !== null) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (SECRET_KEY.test(k)) continue;
        out[k] = walk(v, k);
      }
      return out;
    }
    if (typeof node === 'string' && key !== null && /url|origin/i.test(key)) return stripUrlQuery(node);
    return node;
  };
  return walk(value, null) as T;
}

export function buildCopyReport(agent: AgentDiagnostics | null, hub: HubDiagnosticsReport | null): string {
  return JSON.stringify(redactReport({ agent, hub }), null, 2);
}
