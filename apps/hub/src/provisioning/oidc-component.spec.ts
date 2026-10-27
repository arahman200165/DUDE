import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HubProvisioningResponse } from '@dude/contracts/hub';
import { createSecretStore } from '../secrets/secret-store.js';
import { oidcComponent } from './components/oidc.js';
import { setSecretExpected } from './components/secrets.js';
import { checkProvisioning, provision } from './engine.js';
import { cleanRoots, engineOptions, tempPaths } from './provisioning-fixture.js';
import type { ProvisioningContext } from './types.js';

afterEach(cleanRoots);

const OIDC = { clientId: 'client-id.apps.example', redirectOrigin: 'https://hub.example.com' };

function context(overrides: Partial<ProvisioningContext> = {}) {
  const paths = tempPaths('oidc');
  const base: ProvisioningContext = {
    paths, mode: 'check', now: () => 0, store: { state: 'absent' }, platform: 'linux',
    probes: { sqliteVec: () => ({ available: false, reason: 'x' }), fts5: () => 'fts5', workerPing: () => Promise.resolve('ok'), freeBytes: () => null },
    ...overrides,
  };
  const writeConfig = (config: unknown): void => { mkdirSync(path.dirname(paths.configFile), { recursive: true }); writeFileSync(paths.configFile, JSON.stringify(config)); };
  const putSecret = (): void => { createSecretStore({ secretsDir: paths.secretsDir, platform: 'linux' }).put('oidc.clientSecret', 'the-client-secret-value'); };
  return { paths, ctx: { ...base, paths }, writeConfig, putSecret };
}

describe('the oidc provisioning component', () => {
  it('is not-configured without an oidc block (no hub.json at all, or one without it)', async () => {
    const { ctx, writeConfig } = context();
    expect(await oidcComponent.check(ctx)).toMatchObject({ state: 'not-configured', detail: 'Google sign-in is not configured; the password is the only sign-in.' });
    writeConfig({ port: 8443 });
    expect((await oidcComponent.check(ctx)).state).toBe('not-configured');
  });

  it('needs attention when configured but the client secret is not on this machine', async () => {
    const { ctx, writeConfig } = context();
    writeConfig({ oidc: OIDC });
    expect(await oidcComponent.check(ctx)).toMatchObject({ state: 'needs-attention', detail: 'The Google client secret is not stored on this machine; enter it again.' });
  });

  it('needs attention when the oidc block is invalid, without echoing it', async () => {
    const { ctx, writeConfig } = context();
    writeConfig({ oidc: { ...OIDC, redirectOrigin: 'http://hub.example.com', clientSecret: 'LEAKED' } });
    const outcome = await oidcComponent.check(ctx);
    expect(outcome.state).toBe('needs-attention');
    expect(JSON.stringify(outcome)).not.toMatch(/LEAKED|hub\.example\.com/);
  });

  it('is ready with a block and a secret, and names the only hosts it will contact (the egress allowlist)', async () => {
    const { ctx, writeConfig, putSecret } = context();
    writeConfig({ oidc: OIDC });
    putSecret();
    const outcome = await oidcComponent.check(ctx);
    expect(outcome).toMatchObject({ state: 'ready' });
    expect(outcome.detail).toContain('accounts.google.com, oauth2.googleapis.com, www.googleapis.com');
    expect(JSON.stringify(outcome)).not.toContain('the-client-secret-value');
  });

  it('is degraded (the contract has no unreachable state) when the running Hub last found Google unreachable', async () => {
    const { ctx, writeConfig, putSecret } = context();
    writeConfig({ oidc: OIDC });
    putSecret();
    const outcome = await oidcComponent.check({ ...ctx, oidc: () => ({ state: 'unreachable', detail: 'x' }) });
    expect(outcome).toMatchObject({ state: 'degraded' });
    expect(outcome.detail).toMatch(/password/);
    expect((await oidcComponent.check({ ...ctx, oidc: () => ({ state: 'ready', detail: 'x' }) })).state).toBe('ready');
  });

  it('never creates hub.json or the secrets directory just by checking', async () => {
    const { ctx, paths } = context();
    await oidcComponent.check(ctx);
    const { existsSync } = await import('node:fs');
    expect(existsSync(paths.configFile)).toBe(false);
    expect(existsSync(paths.secretsDir)).toBe(false);
  });
});

describe('inside the whole engine', () => {
  it('is reported after the tunnel, as not-configured, and never blocks the overall state', async () => {
    const paths = tempPaths('oidc-engine');
    const run = await provision(paths, engineOptions({ hubInstanceId: 'hub-a' }));
    expect(Value.Check(HubProvisioningResponse, run.report)).toBe(true);
    const ids = run.report.components.map((c) => c.id);
    expect(ids.indexOf('oidc')).toBe(ids.indexOf('tunnel') + 1);
    expect(run.report.components.find((c) => c.id === 'oidc')?.state).toBe('not-configured');
    expect(run.report.overall).toBe('ready');
  });

  it('after a restore (the secret and the oidc block are gone but were expected) asks to configure it again', async () => {
    const paths = tempPaths('oidc-restore');
    const first = await provision(paths, engineOptions({ hubInstanceId: 'hub-a' }));
    expect(first.report.overall).toBe('ready');
    const { openSaveSphereDb } = await import('../savesphere-db/open.js');
    const opened = openSaveSphereDb(paths);
    if (opened.status !== 'ready') throw new Error('expected ready');
    setSecretExpected(opened.store.db, 'oidc.clientSecret');
    opened.store.close();
    const report = await checkProvisioning(paths, engineOptions({ hubInstanceId: 'hub-a' }));
    expect(report.components.find((c) => c.id === 'oidc')).toMatchObject({ state: 'needs-attention' });
  });
});
