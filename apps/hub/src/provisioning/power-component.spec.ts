import { afterEach, describe, expect, it } from 'vitest';
import type { HubPowerStatus } from '@dude/contracts/hub';
import { powerComponent } from './components/power.js';
import { cleanRoots, tempPaths } from './provisioning-fixture.js';
import type { ProvisioningContext } from './types.js';

afterEach(cleanRoots);

const view = (over: Partial<HubPowerStatus> = {}): HubPowerStatus => ({
  verdict: 'ok', checkedAt: '2026-10-29T10:00:00.000Z', sleepAcMinutes: 0, hibernateAcMinutes: 0, sleepStates: ['S3'], applied: false, regressed: false, optedOut: false, ...over,
});
const context = (platform: NodeJS.Platform, power?: () => HubPowerStatus | undefined): ProvisioningContext => ({
  paths: tempPaths(), mode: 'check', now: () => 0, store: { state: 'absent' }, platform, probes: {} as never, ...(power ? { power } : {}),
});
const check = (platform: NodeJS.Platform, status?: HubPowerStatus) => powerComponent.check(context(platform, status ? () => status : undefined)) as ReturnType<typeof powerComponent.check> & object;

/** The `power` provisioning component (32-SS1, Milestone 851): read-only, from the running Hub's last check. */
describe('the power provisioning component', () => {
  it('is unavailable by design off Windows, never an error', async () => {
    expect(await check('linux', view())).toMatchObject({ state: 'unavailable', detail: expect.stringMatching(/Windows Hub/) });
    expect(await check('linux')).not.toHaveProperty('nextAction');
    expect(await check('win32', view({ verdict: 'unsupported' }))).toMatchObject({ state: 'unavailable' });
  });

  it('is not configured until the running Hub has checked once', async () => {
    expect(await check('win32')).toMatchObject({ state: 'not-configured', nextAction: 'dude-hub power status' });
  });

  it.each([
    ['ok', view(), 'ready', /does not sleep or hibernate/],
    ['needs change', view({ verdict: 'needs-change', sleepAcMinutes: 30 }), 'degraded', /can sleep or hibernate on AC power; the tunnel/],
    ['reverted on purpose', view({ verdict: 'needs-change', sleepAcMinutes: 30, optedOut: true }), 'degraded', /reverted on purpose/],
    ['regressed', view({ verdict: 'needs-change', sleepAcMinutes: 30, regressed: true, applied: true }), 'needs-attention', /again after it had been set/],
    ['unreadable', view({ verdict: 'unknown', sleepAcMinutes: null }), 'degraded', /could not be read/],
  ])('%s', async (_name, status, state, detail) => {
    const outcome = await check('win32', status);
    expect(outcome.state).toBe(state);
    expect(outcome.detail).toMatch(detail);
    if (state !== 'ready') expect(outcome.nextAction).toMatch(/dude-hub power (apply|status)/);
    expect(outcome.detail.length).toBeLessThanOrEqual(200);
  });
});
