import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sanitizeRestoredConfig } from '../backup/restore.js';
import { DEFAULT_OIDC_ISSUER, loadOrCreateHubConfig, parseHubConfig, parseOidcConfig, writeHubConfig } from './hub-config.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const good = { clientId: '1234567890-abc.apps.googleusercontent.com', redirectOrigin: 'https://hub.example.com' };

describe('oidc config', () => {
  it('defaults the issuer to Google', () => {
    expect(parseOidcConfig(good)).toEqual({ issuer: DEFAULT_OIDC_ISSUER, ...good });
    expect(DEFAULT_OIDC_ISSUER).toBe('https://accounts.google.com');
  });

  it('accepts an explicit https issuer (with a path, as a realm) and a redirect origin with a port', () => {
    expect(parseOidcConfig({ ...good, issuer: 'https://idp.example.org/realms/home', redirectOrigin: 'https://hub.example.com:8443' })).toEqual({
      issuer: 'https://idp.example.org/realms/home', clientId: good.clientId, redirectOrigin: 'https://hub.example.com:8443',
    });
  });

  it('allows plain http only for a loopback redirect origin (the OAuth client rule for local development)', () => {
    for (const redirectOrigin of ['http://localhost:8443', 'http://127.0.0.1:8443', 'http://[::1]:8443']) expect(parseOidcConfig({ ...good, redirectOrigin }).redirectOrigin).toBe(redirectOrigin);
    for (const redirectOrigin of ['http://hub.example.com', 'http://192.168.1.5:8443', 'ftp://hub.example.com']) expect(() => parseOidcConfig({ ...good, redirectOrigin })).toThrow(/https/);
  });

  it('rejects anything that is not an object, and unknown keys (a secret must never be a config key)', () => {
    for (const raw of [null, 'x', 5, [], undefined]) expect(() => parseOidcConfig(raw)).toThrow('must be an object');
    expect(() => parseOidcConfig({ ...good, clientSecret: 'oops' })).toThrow('unknown key "clientSecret"');
    expect(() => parseOidcConfig({ ...good, hd: 'example.com' })).toThrow('unknown key "hd"');
    expect(() => parseOidcConfig({ ...good, scopes: ['openid'] })).toThrow('unknown key "scopes"');
  });

  it('requires a clean client id', () => {
    for (const clientId of [undefined, '', 5, 'has space', 'tab\tid', 'line\nbreak', 'x'.repeat(257), null]) expect([String(clientId), (() => { try { parseOidcConfig({ ...good, clientId }); return 'ok'; } catch { return 'rejected'; } })()]).toEqual([String(clientId), 'rejected']);
  });

  it('requires a bare https issuer: no credentials, port, query, fragment, trailing slash, IP, local name or other scheme', () => {
    const bad = [
      'http://accounts.google.com', 'accounts.google.com', 'https://', 'https://user:pw@accounts.google.com', 'https://accounts.google.com:8443', 'https://accounts.google.com?x=1',
      'https://accounts.google.com#frag', 'https://accounts.google.com/', 'https://127.0.0.1', 'https://[::1]', 'https://localhost', 'https://intranet', 'https://ACCOUNTS.google.com', '', 5, 'https://' + 'a'.repeat(300) + '.com',
    ];
    for (const issuer of bad) expect([String(issuer).slice(0, 40), (() => { try { parseOidcConfig({ ...good, issuer }); return 'ok'; } catch { return 'rejected'; } })()]).toEqual([String(issuer).slice(0, 40), 'rejected']);
  });

  it('requires a redirect origin that is an origin and nothing more', () => {
    const bad = [undefined, '', 5, 'hub.example.com', 'https://hub.example.com/', 'https://hub.example.com/path', 'https://hub.example.com?x=1', 'https://hub.example.com#x', 'https://user@hub.example.com', 'https://HUB.example.com', 'https://' + 'a'.repeat(300) + '.com'];
    for (const redirectOrigin of bad) expect([String(redirectOrigin).slice(0, 40), (() => { try { parseOidcConfig({ ...good, redirectOrigin }); return 'ok'; } catch { return 'rejected'; } })()]).toEqual([String(redirectOrigin).slice(0, 40), 'rejected']);
  });
});

describe('oidc in hub.json', () => {
  it('is optional: absent means off, and the default config has none', () => {
    expect(parseHubConfig({}).oidc).toBeUndefined();
    expect(parseHubConfig({ port: 9000 })).not.toHaveProperty('oidc');
  });

  it('is validated strictly inside the whole file', () => {
    expect(parseHubConfig({ oidc: good }).oidc).toEqual({ issuer: DEFAULT_OIDC_ISSUER, ...good });
    expect(() => parseHubConfig({ oidc: { ...good, redirectOrigin: 'http://example.com' } })).toThrow(/oidc\.redirectOrigin/);
    expect(() => parseHubConfig({ oidc: null })).toThrow('"oidc" must be an object');
  });

  it('round-trips through the file', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'oidc-config-'));
    roots.push(root);
    const file = path.join(root, 'hub.json');
    writeHubConfig(file, parseHubConfig({ oidc: good }));
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ oidc: { issuer: DEFAULT_OIDC_ISSUER, ...good } });
    expect(loadOrCreateHubConfig(file).oidc).toEqual({ issuer: DEFAULT_OIDC_ISSUER, ...good });
  });

  it('never holds a secret: the written file has no secret-looking field', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'oidc-config-'));
    roots.push(root);
    const file = path.join(root, 'hub.json');
    writeHubConfig(file, parseHubConfig({ oidc: good }));
    expect(readFileSync(file, 'utf8')).not.toMatch(/secret|password|token/i);
  });

  it('is not carried through a restore: the restored Hub is a new instance and configures sign-in again', () => {
    expect(sanitizeRestoredConfig(parseHubConfig({ oidc: good }))).not.toHaveProperty('oidc');
  });
});
