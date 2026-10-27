import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import { HUB_BEARER_PREFIXES, HUB_CREDENTIAL_TYPES } from './credentials.js';
import {
  HUB_INGEST_PATHS, INGEST_PATH_PREFIX, INGEST_REVOKE_ACTION, INGEST_REVOKE_CONSEQUENCE_CLASS, INGEST_SCOPES, INGEST_TOKEN_PATTERN, INGEST_TOKEN_PREFIX,
  IngestPingResponse, IngestTokenCreateRequest, IngestTokenCreateResponse, IngestTokenInfo, IngestTokenRevokePreview, IngestTokenRevokeRequest, ingestRevokePath, ingestRevokePreviewPath, isIngestScope,
} from './ingest.schema.js';

const info = { id: 'i', label: 'l', prefix: 'dit_abcdef', scopes: ['ingest:ping'], state: 'active', createdAt: 't', lastUsedAt: null, expiresAt: null, revokedAt: null };

describe('ingest contracts', () => {
  it('keeps the token-only namespace apart from the owner management routes', () => {
    expect(HUB_INGEST_PATHS.ping.startsWith(INGEST_PATH_PREFIX)).toBe(true);
    expect(HUB_INGEST_PATHS.tokens.startsWith(INGEST_PATH_PREFIX)).toBe(false);
    expect(ingestRevokePreviewPath('a b')).toBe('/api/v1/admin/ingest-tokens/a%20b/revoke/preview');
    expect(ingestRevokePath('x')).toBe('/api/v1/admin/ingest-tokens/x/revoke');
  });

  it('has a closed scope list (Milestone 843 needs one; SS3 appends the capture scopes)', () => {
    expect([...INGEST_SCOPES]).toEqual(['ingest:ping']);
    expect(isIngestScope('ingest:ping')).toBe(true);
    expect(isIngestScope('capture:write')).toBe(false);
  });

  it('a token is dit_ plus 43 base64url characters, and every bearer family has its own prefix (none a prefix of another)', () => {
    expect(INGEST_TOKEN_PATTERN.test(`${INGEST_TOKEN_PREFIX}${'A'.repeat(43)}`)).toBe(true);
    for (const bad of ['dit_', `dit_${'A'.repeat(42)}`, `dit_${'A'.repeat(44)}`, `dob_${'A'.repeat(43)}`, `dit_${'.'.repeat(43)}`]) expect(INGEST_TOKEN_PATTERN.test(bad)).toBe(false);
    const prefixes = Object.values(HUB_BEARER_PREFIXES);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const a of prefixes) for (const b of prefixes) if (a !== b) expect(a.startsWith(b)).toBe(false);
    expect(HUB_BEARER_PREFIXES['ingest-token']).toBe(INGEST_TOKEN_PREFIX);
  });

  it('lists the ingest-token credential type beside the others', () => {
    expect([...HUB_CREDENTIAL_TYPES]).toEqual(['none', 'setup-token', 'owner-cookie', 'owner-bearer', 'device-token', 'ingest-token']);
  });

  it('a mint request needs a label and 1+ unique known scopes; expiry is 1 to 365 days; nothing else', () => {
    const ok = { label: 'Phone', scopes: ['ingest:ping'] };
    expect(Value.Check(IngestTokenCreateRequest, ok)).toBe(true);
    expect(Value.Check(IngestTokenCreateRequest, { ...ok, expiresInDays: 365 })).toBe(true);
    for (const bad of [{ ...ok, scopes: [] }, { ...ok, scopes: ['x'] }, { ...ok, scopes: ['ingest:ping', 'ingest:ping'] }, { ...ok, label: '' }, { ...ok, expiresInDays: 0 }, { ...ok, expiresInDays: 366 }, { ...ok, expiresInDays: 1.5 }, { ...ok, extra: 1 }]) {
      expect(Value.Check(IngestTokenCreateRequest, bad)).toBe(false);
    }
  });

  it('only the create response carries a secret; an info row has neither secret nor hash', () => {
    expect(Value.Check(IngestTokenInfo, info)).toBe(true);
    expect(Object.keys(IngestTokenInfo.properties).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'label', 'lastUsedAt', 'prefix', 'revokedAt', 'scopes', 'state']);
    expect(Value.Check(IngestTokenCreateResponse, { token: info, secret: `dit_${'A'.repeat(43)}` })).toBe(true);
    expect(Value.Check(IngestTokenCreateResponse, { token: info, secret: 'dit_short' })).toBe(false);
  });

  it('revoke is two-step with a consequence class tag and a token bound to the ingest token id', () => {
    expect(INGEST_REVOKE_ACTION).toBe('ingest.token-revoke');
    expect([...INGEST_REVOKE_CONSEQUENCE_CLASS]).toEqual(['secret-management']);
    expect(Value.Check(IngestTokenRevokePreview, { confirmToken: 't', expiresAt: 'x', consequenceClass: ['secret-management'], summary: { action: INGEST_REVOKE_ACTION, id: 'i', label: 'l', prefix: 'p' } })).toBe(true);
    expect(Value.Check(IngestTokenRevokeRequest, { confirmToken: 't' })).toBe(true);
    expect(Value.Check(IngestTokenRevokeRequest, {})).toBe(false);
  });

  it('the ping answer is ok, the token id, its scopes and the server time', () => {
    expect(Value.Check(IngestPingResponse, { ok: true, tokenId: 'i', scopes: ['ingest:ping'], serverTime: 't' })).toBe(true);
    expect(Value.Check(IngestPingResponse, { ok: false, tokenId: 'i', scopes: [], serverTime: 't' })).toBe(false);
  });

  it('extends the closed audit list', () => {
    for (const event of ['ingest.token-created', 'ingest.token-revoked', 'ingest.auth-failed']) expect(HUB_AUDIT_EVENTS as readonly string[]).toContain(event);
  });
});
