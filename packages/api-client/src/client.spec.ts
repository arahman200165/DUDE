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
});
