import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import { HUB_ERROR_CODES } from './error.schema.js';
import {
  HUB_OIDC_PATHS, OIDC_UNLINK_ACTION, OIDC_UNLINK_CONSEQUENCE_CLASS, OidcAccount, OidcLinkCompleteRequest, OidcStartRequest, OidcStatusResponse, OidcUnlinkPreview, OidcUnlinkRequest,
} from './oidc.schema.js';

describe('Google sign-in contracts', () => {
  it('names every route under the auth prefix, including the session-less callback', () => {
    expect(Object.values(HUB_OIDC_PATHS).every((path) => path.startsWith('/api/v1/auth/oidc/'))).toBe(true);
    expect(HUB_OIDC_PATHS.callback).toBe('/api/v1/auth/oidc/callback');
  });

  it('status carries only two booleans', () => {
    expect(Value.Check(OidcStatusResponse, { enabled: true, configured: true })).toBe(true);
    expect(Value.Check(OidcStatusResponse, { enabled: 'yes', configured: true })).toBe(false);
  });

  it('start accepts only an optional return path, and the completion token is exactly 43 base64url characters', () => {
    expect(Value.Check(OidcStartRequest, {})).toBe(true);
    expect(Value.Check(OidcStartRequest, { returnTo: '/settings/security' })).toBe(true);
    expect(Value.Check(OidcStartRequest, { returnTo: '/x', purpose: 'link' })).toBe(false);
    expect(Value.Check(OidcLinkCompleteRequest, { linkToken: 'A'.repeat(43) })).toBe(true);
    for (const bad of ['', 'A'.repeat(42), 'A'.repeat(44), `${'A'.repeat(42)}!`]) expect(Value.Check(OidcLinkCompleteRequest, { linkToken: bad })).toBe(false);
  });

  it('an account shows a display address and times, never a subject', () => {
    const account = { id: 'a', provider: 'google', email: 'a@example.com', linkedAt: 't', lastUsedAt: null };
    expect(Value.Check(OidcAccount, account)).toBe(true);
    expect(Object.keys(OidcAccount.properties)).toEqual(['id', 'provider', 'email', 'linkedAt', 'lastUsedAt']);
    expect(Value.Check(OidcAccount, { ...account, provider: 'github' })).toBe(false);
  });

  it('unlink is two-step with a consequence class tag and a token bound to the account', () => {
    expect(OIDC_UNLINK_ACTION).toBe('oidc.unlink');
    expect([...OIDC_UNLINK_CONSEQUENCE_CLASS]).toEqual(['secret-management']);
    expect(Value.Check(OidcUnlinkPreview, {
      confirmToken: 't', expiresAt: 'x', consequenceClass: ['secret-management'], summary: { action: 'oidc.unlink', accountId: 'a', email: null, remainingAccounts: 1 },
    })).toBe(true);
    expect(Value.Check(OidcUnlinkRequest, { accountId: 'a', confirmToken: 't' })).toBe(true);
    expect(Value.Check(OidcUnlinkRequest, { accountId: 'a' })).toBe(false);
  });

  it('extends the closed lists: audit events and the unavailable error code', () => {
    for (const event of ['oidc.signin', 'oidc.signin-failed', 'oidc.refused-account', 'oidc.link-started', 'oidc.link', 'oidc.unlink', 'oidc.unreachable']) expect(HUB_AUDIT_EVENTS as readonly string[]).toContain(event);
    expect(HUB_ERROR_CODES as readonly string[]).toContain('oidc-unavailable');
  });
});
