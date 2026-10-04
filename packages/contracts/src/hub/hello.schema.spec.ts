import { describe, it, expect } from 'vitest';
import { Value } from 'typebox/value';
import { HelloResponse } from './hello.schema.js';
import { ErrorEnvelope, HUB_ERROR_CODES, isHubErrorCode } from './error.schema.js';

const spki = 'A'.repeat(43);
const valid = {
  service: 'dude-hub', protocolVersion: 1, minClientProtocol: 1, hubVersion: '0.1.0',
  hubInstanceId: '123e4567-e89b-42d3-a456-426614174000', environmentId: null, bootstrapped: false,
  tls: { spkiSha256: spki, nextSpkiSha256: null },
};

describe('HelloResponse', () => {
  it('accepts a valid hello', () => {
    expect(Value.Check(HelloResponse, valid)).toBe(true);
    expect(Value.Check(HelloResponse, { ...valid, environmentId: 'env', tls: { spkiSha256: spki, nextSpkiSha256: spki } })).toBe(true);
  });
  it.each([
    ['wrong service', { ...valid, service: 'other' }],
    ['non-integer protocol', { ...valid, protocolVersion: 1.5 }],
    ['bad uuid', { ...valid, hubInstanceId: 'nope' }],
    ['missing tls', { ...valid, tls: undefined }],
    ['short spki', { ...valid, tls: { spkiSha256: 'abc', nextSpkiSha256: null } }],
    ['non-base64url spki', { ...valid, tls: { spkiSha256: '+'.repeat(43), nextSpkiSha256: null } }],
    ['non-boolean bootstrapped', { ...valid, bootstrapped: 'yes' }],
  ])('rejects %s', (_n, v) => expect(Value.Check(HelloResponse, v)).toBe(false));
  it('rejects non-objects', () => expect(Value.Check(HelloResponse, null)).toBe(false));
});

describe('ErrorEnvelope', () => {
  it('accepts and rejects', () => {
    expect(Value.Check(ErrorEnvelope, { error: { code: 'not-found', message: 'x' } })).toBe(true);
    expect(Value.Check(ErrorEnvelope, { error: { code: 1, message: 'x' } })).toBe(false);
    expect(Value.Check(ErrorEnvelope, { code: 'x' })).toBe(false);
  });
  it('has a closed code list', () => {
    expect(HUB_ERROR_CODES).toHaveLength(12);
    expect(isHubErrorCode('hub-transferred')).toBe(true);
    expect(isHubErrorCode('locked')).toBe(true);
    expect(isHubErrorCode('weird')).toBe(false);
  });
});
