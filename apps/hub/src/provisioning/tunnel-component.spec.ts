import { afterEach, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_TUNNEL_DISCLOSURE, HubProvisioningResponse } from '@dude/contracts/hub';
import type { HubTunnelStatusResponse } from '@dude/contracts/hub';
import { createSecretStore } from '../secrets/secret-store.js';
import { tunnelComponent } from './components/tunnel.js';
import { checkProvisioning, provision } from './engine.js';
import { cleanRoots, engineOptions, restoreInto, tempPaths } from './provisioning-fixture.js';
import type { ProvisioningContext } from './types.js';

afterEach(cleanRoots);

const view = (over: Partial<HubTunnelStatusResponse> = {}): HubTunnelStatusResponse => ({
  configured: true, enabled: true, hostname: 'notes.example.com', supported: true, state: 'ready', ready: true, tokenPresent: true, restarts: 0, lastError: null,
  startedAt: '2026-10-27T10:00:00.000Z', lastReadyAt: '2026-10-27T10:00:05.000Z', dashboard: null, disclosure: [...HUB_TUNNEL_DISCLOSURE], logTail: [], ...over,
});
const context = (platform: NodeJS.Platform, tunnel?: () => HubTunnelStatusResponse): ProvisioningContext => ({
  paths: tempPaths(), mode: 'check', now: () => 0, store: { state: 'absent' }, platform,
  probes: {} as never, ...(tunnel ? { tunnel } : {}),
});
const check = (platform: NodeJS.Platform, status?: HubTunnelStatusResponse) => tunnelComponent.check(context(platform, status ? () => status : undefined));

/** The `tunnel` provisioning component (32-SS1, Milestone 837): not-configured, connecting, ready, degraded and needs-attention. */
describe('the tunnel provisioning component', () => {
  it('is unavailable by design off Windows (Docker), never an error', async () => {
    expect(await check('linux', view())).toMatchObject({ state: 'unavailable', detail: expect.stringMatching(/not available in this deployment/) });
    expect((await check('linux'))).not.toHaveProperty('nextAction');
  });

  it('is not configured with no tunnel and no token expected, and points at the elevated command', async () => {
    for (const outcome of [await check('win32'), await check('win32', view({ configured: false, enabled: false, hostname: null, state: 'not-configured', tokenPresent: false }))]) {
      expect(outcome.state).toBe('not-configured');
      expect(outcome.nextAction).toMatch(/dude-hub network tunnel on/);
    }
  });

  it.each([
    ['ready', view(), 'ready', /Connected through Cloudflare for notes\.example\.com/],
    ['connecting', view({ state: 'connecting', ready: false }), 'degraded', /Connecting to Cloudflare/],
    ['degraded', view({ state: 'degraded', ready: false }), 'degraded', /stopped answering/],
    ['stopped', view({ state: 'stopped', ready: false }), 'degraded', /connector is not running/],
    ['failed', view({ state: 'failed', ready: false, lastError: 'crashed-repeatedly' }), 'needs-attention', /crashed-repeatedly/],
  ] as const)('maps a %s connector to %s', async (_label, status, state, detail) => {
    const outcome = await check('win32', status);
    expect(outcome.state).toBe(state);
    expect(outcome.detail).toMatch(detail);
    if (state === 'ready') expect(outcome.nextAction).toBeUndefined();
    else expect(outcome.nextAction).toBeTruthy();
  });

  it('needs attention when a tunnel is configured without its connector token', async () => {
    const outcome = await check('win32', view({ tokenPresent: false, state: 'failed', lastError: 'token-missing' }));
    expect(outcome.state).toBe('needs-attention');
    expect(outcome.detail).toMatch(/no connector token is stored/);
    expect(outcome.nextAction).toMatch(/--token-stdin/);
  });

  it('never carries a value: details are sentences with no token, path or hostname beyond the configured domain', async () => {
    const outcome = await check('win32', view({ state: 'failed', ready: false, lastError: 'binary-hash-mismatch' }));
    expect(JSON.stringify(outcome)).not.toMatch(/eyJ|TUNNEL_TOKEN|[A-Za-z]:[\\/]/);
  });

  it('after a restore needs attention because the connector token was entered before and is gone (it never travels in a backup)', async () => {
    const original = tempPaths('original');
    await provision(original, engineOptions({ hubInstanceId: 'hub-old' }));
    createSecretStore({ secretsDir: original.secretsDir, platform: 'linux' }).put('tunnel.connectorToken', 'not-a-real-token-value');
    await provision(original, engineOptions({ hubInstanceId: 'hub-old' })); // records that the purpose is expected
    const restored = restoreInto(original);
    const gone = view({ configured: false, enabled: false, hostname: null, state: 'not-configured', tokenPresent: false });
    const report = await checkProvisioning(restored, engineOptions({ hubInstanceId: 'hub-new', platform: 'win32', tunnel: () => gone }));
    const tunnel = report.components.find((c) => c.id === 'tunnel');
    expect(tunnel).toMatchObject({ state: 'needs-attention' });
    expect(tunnel?.detail).toMatch(/must be entered again/);
    expect(tunnel?.nextAction).toMatch(/--token-stdin/);
    expect(Value.Check(HubProvisioningResponse, report)).toBe(true);
    expect(report.overall).not.toBe('ready');
    expect(JSON.stringify(report)).not.toContain('not-a-real-token-value');
    // Entering it again (and turning the tunnel on) clears the finding.
    const back = await checkProvisioning(restored, engineOptions({ hubInstanceId: 'hub-new', platform: 'win32', tunnel: () => view() }));
    expect(back.components.find((c) => c.id === 'tunnel')?.state).toBe('ready');
  });

  it('is a read-only component: a provisioning run never starts, stops or configures the tunnel', () => {
    expect(tunnelComponent.provision).toBeUndefined();
    expect(tunnelComponent.id).toBe('tunnel');
    expect(tunnelComponent.core).toBeUndefined();
  });
});
