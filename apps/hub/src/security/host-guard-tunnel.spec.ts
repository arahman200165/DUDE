import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { createHostGuard } from './host-guard.js';

/** The tunnel part of the Host guard (32-SS1, Milestone 837, PD-119): exact hosts, the www redirect target and what can never steer it. */
const HOST = 'notes.example.com';
const PORT = 47600;
const guard = (tunnel = true) => createHostGuard(
  { bind: 'loopback', names: [HOST, 'other.example.com'], proxy: { trusted: ['127.0.0.1', '::1'], publicOrigin: `https://${HOST}` }, ...(tunnel ? { tunnel: { hostname: HOST } } : {}) },
  () => PORT,
);
const req = (host: string | undefined, url = '/', peer = '127.0.0.1') => ({ host, raw: { url }, socket: { remoteAddress: peer } }) as unknown as Pick<FastifyRequest, 'host' | 'socket' | 'raw'>;

describe('tunnel host allowlist', () => {
  it('serves exactly the domain, www and loopback names through the connector', () => {
    const g = guard();
    for (const host of [HOST, `${HOST}:443`, `www.${HOST}`, `www.${HOST}:443`, `127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`, `NOTES.EXAMPLE.COM`]) expect(g.isRequestAllowed(req(host)), host).toBe(true);
    for (const host of ['other.example.com', 'evil.example', `${HOST}:8443`, `${HOST}.evil.example`, `127.0.0.1`, '203.0.113.7', undefined]) expect(g.isRequestAllowed(req(host)), String(host)).toBe(false);
    expect(g.isAllowed(HOST)).toBe(true);
    expect(g.isAllowed('other.example.com')).toBe(false);
  });

  it('serves an untrusted peer loopback names only, never the domain or www', () => {
    const g = guard();
    expect(g.isRequestAllowed(req(`127.0.0.1:${PORT}`, '/', '127.0.0.2'))).toBe(true);
    for (const host of [HOST, `www.${HOST}`]) expect(g.isRequestAllowed(req(host, '/', '127.0.0.2'))).toBe(false);
    expect(g.isRequestAllowed(req(HOST, '/', '10.0.0.9'))).toBe(false);
  });

  it('without tunnel mode a proxy Hub still serves its other configured names (nothing changes)', () => {
    const g = guard(false);
    expect(g.isRequestAllowed(req('other.example.com'))).toBe(true);
    expect(g.wwwRedirectTarget(req(`www.${HOST}`))).toBeNull();
  });
});

describe('www redirect target', () => {
  it('keeps path and query and is built from the configured origin', () => {
    const g = guard();
    expect(g.wwwRedirectTarget(req(`www.${HOST}`, '/a/b?x=1&y=%20z'))).toBe(`https://${HOST}/a/b?x=1&y=%20z`);
    expect(g.wwwRedirectTarget(req(`WWW.${HOST}:443`, '/'))).toBe(`https://${HOST}/`);
    expect(g.wwwRedirectTarget(req(`www.${HOST}`, '//evil.example/x'))).toBe(`https://${HOST}//evil.example/x`);
  });

  it('sends anything that is not an origin-form target to the root, never appending it', () => {
    const g = guard();
    for (const url of ['http://evil.example/x', '*', 'evil.example:443', '/with space', '/café', '/ctl\u0001', '']) {
      expect(g.wwwRedirectTarget(req(`www.${HOST}`, url)), JSON.stringify(url)).toBe(`https://${HOST}/`);
    }
  });

  it('applies only to exactly www.<domain> from the trusted connector', () => {
    const g = guard();
    for (const host of [HOST, 'www.evil.example', `www.www.${HOST}`, `wwww.${HOST}`, undefined, 'localhost:47600']) expect(g.wwwRedirectTarget(req(host)), String(host)).toBeNull();
    expect(g.wwwRedirectTarget(req(`www.${HOST}`, '/', '127.0.0.2'))).toBeNull();
    expect(g.wwwRedirectTarget(req(`www.${HOST}`, '/', '203.0.113.5'))).toBeNull();
  });
});
