/**
 * Pure, framework-free claim-level linting for an already-decoded JWT, used
 * by the JWT Claims Analyzer tool. Never verifies a signature — flags
 * structural/temporal issues in the header and payload only.
 */

export type ClaimFindingSeverity = 'error' | 'warning' | 'info';

export interface ClaimFinding {
  readonly severity: ClaimFindingSeverity;
  readonly code: string;
  readonly message: string;
}

const OVERSIZED_TOKEN_BYTES = 8192;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberClaim(record: Record<string, unknown>, claim: string): number | undefined {
  return typeof record[claim] === 'number' ? (record[claim] as number) : undefined;
}

export function analyzeClaims(header: unknown, payload: unknown, now: Date = new Date()): readonly ClaimFinding[] {
  const findings: ClaimFinding[] = [];
  const h = isRecord(header) ? header : {};
  const p = isRecord(payload) ? payload : {};

  if (h['alg'] === 'none') {
    findings.push({
      severity: 'error',
      code: 'alg-none',
      message: 'Header declares "alg":"none" — this token is unsigned and must never be trusted.',
    });
  }

  if (!('exp' in p)) {
    findings.push({ severity: 'warning', code: 'missing-exp', message: 'No "exp" claim — this token never expires.' });
  } else {
    const exp = numberClaim(p, 'exp');
    if (exp === undefined) {
      findings.push({ severity: 'warning', code: 'invalid-exp', message: '"exp" claim is present but not a numeric timestamp.' });
    } else if (exp * 1000 <= now.getTime()) {
      findings.push({ severity: 'error', code: 'expired', message: `Token expired at ${new Date(exp * 1000).toISOString()}.` });
    }
  }

  if ('nbf' in p) {
    const nbf = numberClaim(p, 'nbf');
    if (nbf !== undefined && nbf * 1000 > now.getTime()) {
      findings.push({ severity: 'warning', code: 'not-yet-valid', message: `Token is not valid until ${new Date(nbf * 1000).toISOString()}.` });
    }
  }

  if (!('iat' in p)) {
    findings.push({ severity: 'info', code: 'missing-iat', message: 'No "iat" claim — issue time cannot be audited.' });
  } else {
    const iat = numberClaim(p, 'iat');
    if (iat !== undefined && iat * 1000 > now.getTime()) {
      findings.push({ severity: 'warning', code: 'iat-in-future', message: '"iat" claim is in the future.' });
    }
  }

  for (const claim of ['iss', 'sub', 'aud'] as const) {
    if (!(claim in p)) {
      findings.push({ severity: 'info', code: `missing-${claim}`, message: `No "${claim}" claim — recommended for issuer/subject/audience validation.` });
    }
  }

  const approxBytes = JSON.stringify(h).length + JSON.stringify(p).length;
  if (approxBytes > OVERSIZED_TOKEN_BYTES) {
    findings.push({
      severity: 'warning',
      code: 'oversized',
      message: `Token header+payload is approximately ${approxBytes} bytes — larger than 8KB, which can be hostile to cookie or header size limits.`,
    });
  }

  return findings;
}
