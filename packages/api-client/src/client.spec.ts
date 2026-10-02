import { describe, it, expect } from 'vitest';
import { createHubClient } from './client.js';
import { HubApiError, HubProtocolError } from './errors.js';
import type { HubRequest, HubResponse, HubTransport } from './transport.js';

const hello = {
  service: 'dude-hub', protocolVersion: 1, minClientProtocol: 1, hubVersion: '0.1.0',
  hubInstanceId: '123e4567-e89b-42d3-a456-426614174000', environmentId: null, bootstrapped: false,
  tls: { spkiSha256: 'A'.repeat(43), nextSpkiSha256: null },
};
function fake(res: Partial<HubResponse>): HubTransport & { seen: HubRequest[] } {
  const seen: HubRequest[] = [];
  return { seen, request: async (r) => { seen.push(r); return { status: 200, headers: {}, body: null, ...res }; } };
}
const opts = { clientProtocol: 1, minHubProtocol: 1 };

describe('createHubClient', () => {
  it('GETs hello and returns the validated body', async () => {
    const t = fake({ body: hello });
    await expect(createHubClient(t, opts).hello()).resolves.toEqual(hello);
    expect(t.seen[0]).toMatchObject({ method: 'GET', path: '/api/v1/hello' });
  });
  it('maps error envelopes to HubApiError', async () => {
    const t = fake({ status: 423, body: { error: { code: 'locked', message: 'busy' } } });
    await expect(createHubClient(t, opts).hello()).rejects.toMatchObject({ name: 'HubApiError', status: 423, code: 'locked', message: 'busy' });
    await expect(createHubClient(t, opts).hello()).rejects.toBeInstanceOf(HubApiError);
  });
  it('throws HubProtocolError for invalid success bodies and malformed errors', async () => {
    await expect(createHubClient(fake({ body: { ...hello, service: 'x' } }), opts).hello()).rejects.toBeInstanceOf(HubProtocolError);
    await expect(createHubClient(fake({ status: 500, body: 'oops' }), opts).hello()).rejects.toBeInstanceOf(HubProtocolError);
  });
  it('reports compatibility with its own protocol bounds', () => {
    const c = createHubClient(fake({}), { clientProtocol: 1, minHubProtocol: 2 });
    expect(c.compatibility({ protocolVersion: 1, minClientProtocol: 1 })).toBe('hub-too-old');
    expect(c.compatibility({ protocolVersion: 2, minClientProtocol: 2 })).toBe('client-too-old');
    expect(c.compatibility({ protocolVersion: 2, minClientProtocol: 1 })).toBe('compatible');
  });

  it('sends the bearer as an Authorization header and never when omitted', async () => {
    const t = fake({ body: { ok: true } });
    await createHubClient(t, opts).signOut('dob_x');
    await createHubClient(t, opts).signOut(undefined);
    expect(t.seen[0]!.headers).toEqual({ authorization: 'Bearer dob_x' });
    expect(t.seen[1]!.headers).toBeUndefined();
  });
  it('validates owner response bodies', async () => {
    await expect(createHubClient(fake({ body: [{ nope: 1 }] }), opts).listDevices('dob_x')).rejects.toBeInstanceOf(HubProtocolError);
    await expect(createHubClient(fake({ status: 401, body: { error: { code: 'unauthorized', message: 'x' } } }), opts).listSessions('dob_x'))
      .rejects.toMatchObject({ status: 401, code: 'unauthorized' });
  });

  const id = '123e4567-e89b-42d3-a456-426614174000';
  const table: Array<[string, (c: ReturnType<typeof createHubClient>) => Promise<unknown>, string, string]> = [
    ['bootstrap', (c) => c.bootstrap({} as never), 'POST', '/api/v1/bootstrap'],
    ['tlsCertificates', (c) => c.tlsCertificates(), 'GET', '/api/v1/tls/certificates'],
    ['enroll', (c) => c.enroll({} as never), 'POST', '/api/v1/devices/enroll'],
    ['deviceChallenge', (c) => c.deviceChallenge(id), 'POST', '/api/v1/auth/device/challenge'],
    ['deviceToken', (c) => c.deviceToken({ deviceId: id, nonce: 'n', signature: 's' }), 'POST', '/api/v1/auth/device/token'],
    ['deviceSelf', (c) => c.deviceSelf('t'), 'GET', '/api/v1/devices/self'],
    ['updateDeviceSelf', (c) => c.updateDeviceSelf('t', {}), 'PATCH', '/api/v1/devices/self'],
    ['unenrollSelf', (c) => c.unenrollSelf('t'), 'POST', '/api/v1/devices/self/unenroll'],
    ['ownerBearer', (c) => c.ownerBearer('t', 'pw'), 'POST', '/api/v1/auth/owner/bearer'],
    ['signOut', (c) => c.signOut('t'), 'POST', '/api/v1/auth/sign-out'],
    ['listDevices', (c) => c.listDevices('t'), 'GET', '/api/v1/devices'],
    ['createPairingCode', (c) => c.createPairingCode('t'), 'POST', '/api/v1/pairing-codes'],
    ['renameDevice', (c) => c.renameDevice('t', id, 'n'), 'PATCH', `/api/v1/devices/${id}`],
    ['revokeDevicePreview', (c) => c.revokeDevicePreview('t', id), 'POST', `/api/v1/devices/${id}/revoke/preview`],
    ['revokeDevice', (c) => c.revokeDevice('t', id, 'c'), 'POST', `/api/v1/devices/${id}/revoke`],
    ['setRecoveryTrust', (c) => c.setRecoveryTrust('t', id, 'p', true), 'PUT', `/api/v1/devices/${id}/recovery-trust`],
    ['listSessions', (c) => c.listSessions('t'), 'GET', '/api/v1/sessions'],
    ['revokeSession', (c) => c.revokeSession('t', 'abcdef0123456789'), 'DELETE', '/api/v1/sessions/abcdef0123456789'],
    ['revokeAllPreview', (c) => c.revokeAllPreview('t'), 'POST', '/api/v1/sessions/revoke-all/preview'],
    ['revokeAll', (c) => c.revokeAll('t', 'c'), 'POST', '/api/v1/sessions/revoke-all'],
    ['listAudit', (c) => c.listAudit('t', { beforeSeq: 9, limit: 5 }), 'GET', '/api/v1/audit?beforeSeq=9&limit=5'],
    ['recoveryCodesPreview', (c) => c.recoveryCodesPreview('t'), 'POST', '/api/v1/owner/recovery-codes/preview'],
    ['regenerateRecoveryCodes', (c) => c.regenerateRecoveryCodes('t', 'c'), 'POST', '/api/v1/owner/recovery-codes'],
    ['changePassword', (c) => c.changePassword('t', 'a', 'b'), 'POST', '/api/v1/owner/password'],
    ['signIn', (c) => c.signIn('pw'), 'POST', '/api/v1/auth/sign-in'],
    ['currentSession', (c) => c.currentSession(), 'GET', '/api/v1/auth/session'],
    ['recover', (c) => c.recover('ABCDE-FGHJK', 'pw'), 'POST', '/api/v1/auth/recover'],
    ['ownerReset', (c) => c.ownerReset('t', 'pw'), 'POST', '/api/v1/owner/reset'],
    ['signOut (cookie)', (c) => c.signOut(), 'POST', '/api/v1/auth/sign-out'],
  ];
  it.each(table)('%s hits %s %s', async (_name, fn, method, path) => {
    const t = fake({ body: null });
    await fn(createHubClient(t, opts)).catch(() => undefined);
    expect(t.seen[0]).toMatchObject({ method, path });
  });
});
