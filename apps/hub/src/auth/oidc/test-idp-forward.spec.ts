import { describe, expect, it } from 'vitest';
import { createForwardingFetch, FAKE_IDP_DOWN_STATUS, FAKE_IDP_URL_HEADER } from './test-idp-forward.js';
import type { FetchLike } from './egress.js';

describe('the fake-provider forwarding fetch (test-only transport)', () => {
  it('sends the asked-for URL in a header to the loopback server, keeping method, headers and body', async () => {
    const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
    const transport: FetchLike = async (url, init) => { seen.push({ url, init }); return new Response('{"ok":true}', { status: 200 }); };
    const forward = createForwardingFetch('http://127.0.0.1:4555/', transport);
    const answer = await forward('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
    expect(answer.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('http://127.0.0.1:4555/fetch');
    expect(seen[0]!.init?.method).toBe('POST');
    expect(seen[0]!.init?.body).toBe('a=1');
    const headers = new Headers(seen[0]!.init?.headers);
    expect(headers.get(FAKE_IDP_URL_HEADER)).toBe('https://oauth2.googleapis.com/token');
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
  });

  it('turns the "provider down" status into the network failure a dead provider is', async () => {
    const forward = createForwardingFetch('http://127.0.0.1:4555', async () => new Response(null, { status: FAKE_IDP_DOWN_STATUS }));
    await expect(forward('https://accounts.google.com/.well-known/openid-configuration')).rejects.toBeInstanceOf(TypeError);
  });
});
