import type { HubProvisioningComponent, HubProvisioningComponentId } from '@dude/contracts/hub';
import type { DesktopProvisionStatus } from '@dude/contracts/shared/models/platform-bridge.model';
import { HubAdminError } from '../../../../core/hub/hub-admin.port';
import {
  BACKUP_INTERVALS, canApplyTunnel, finishOutcome, isAlreadySet, isPreviewGone, passphraseProblem, provisionErrorText, redirectOriginFor, sessionClosedText,
  stepStateFor, stepsFor,
} from './hub-provisioning-wizard-state';

const NOW = '2026-10-29T12:00:00.000Z';
const component = (id: HubProvisioningComponentId, state: HubProvisioningComponent['state']): HubProvisioningComponent => ({ id, state, detail: 'detail.', checkedAt: NOW });

function status(overrides: Partial<DesktopProvisionStatus> = {}, components: readonly HubProvisioningComponent[] = [], overall: DesktopProvisionStatus['provisioning']['overall'] = 'ready'): DesktopProvisionStatus {
  return { provisioning: { overall, checkedAt: NOW, lastRun: null, components: [...components], secrets: [], commands: [] }, tunnel: null, power: null, backup: null, deviceId: null, ...overrides };
}

describe('canApplyTunnel', () => {
  const phrase = 'EXPOSE HUB THROUGH CLOUDFLARE';
  it('accepts only the exact phrase', () => {
    expect(canApplyTunnel(phrase, phrase)).toBe(true);
    expect(canApplyTunnel(phrase.toLowerCase(), phrase)).toBe(false);
    expect(canApplyTunnel(`${phrase} `, phrase)).toBe(false);
    expect(canApplyTunnel(` ${phrase}`, phrase)).toBe(false);
    expect(canApplyTunnel(phrase.slice(0, -1), phrase)).toBe(false);
    expect(canApplyTunnel('', phrase)).toBe(false);
  });
  it('never accepts anything when the Hub sent no phrase', () => {
    expect(canApplyTunnel('', '')).toBe(false);
  });
});

describe('passphraseProblem', () => {
  it('needs 12 characters and a matching confirmation', () => {
    expect(passphraseProblem('short', 'short')).toMatch(/at least 12/);
    expect(passphraseProblem('', '')).toMatch(/at least 12/);
    expect(passphraseProblem('a long enough passphrase', 'a long enough passphrasX')).toMatch(/do not match/);
    expect(passphraseProblem('a long enough passphrase', '')).toMatch(/do not match/);
    expect(passphraseProblem('123456789012', '123456789012')).toBeNull();
  });
  it('offers 6, 12, 24 hours and weekly', () => {
    expect(BACKUP_INTERVALS.map((i) => i.hours)).toEqual([6, 12, 24, 168]);
  });
});

describe('redirectOriginFor', () => {
  it('builds an https origin from a hostname and drops everything else', () => {
    expect(redirectOriginFor('Hub.Example.com')).toBe('https://hub.example.com');
    expect(redirectOriginFor('  hub.example.com. ')).toBe('https://hub.example.com');
    expect(redirectOriginFor('https://hub.example.com/some/path?x=1')).toBe('https://hub.example.com');
    expect(redirectOriginFor('hub.example.com:8443')).toBe('https://hub.example.com:8443');
  });
  it('is empty when no hostname is known or usable', () => {
    expect(redirectOriginFor(null)).toBe('');
    expect(redirectOriginFor(undefined)).toBe('');
    expect(redirectOriginFor('   ')).toBe('');
    expect(redirectOriginFor('not a host')).toBe('');
  });
});

describe('stepStateFor', () => {
  it('has no state without a status', () => {
    expect(stepStateFor('tunnel', null)).toBe('not-configured');
  });

  it('maps the overall provisioning outcome for the first step', () => {
    expect(stepStateFor('status', status())).toBe('done');
    expect(stepStateFor('status', status({}, [], 'not-provisioned'))).toBe('not-configured');
    expect(stepStateFor('status', status({}, [], 'needs-provisioning'))).toBe('needs-attention');
    expect(stepStateFor('status', status({}, [], 'degraded'))).toBe('needs-attention');
  });

  it('maps the tunnel from its own summary, then from the provisioning component', () => {
    const t = { configured: true, hostname: 'hub.example.com', state: 'ready', tokenPresent: true, supported: true };
    expect(stepStateFor('tunnel', status({ tunnel: t }))).toBe('done');
    expect(stepStateFor('tunnel', status({ tunnel: { ...t, tokenPresent: false } }))).toBe('needs-attention');
    expect(stepStateFor('tunnel', status({ tunnel: { ...t, state: 'starting' } }))).toBe('needs-attention');
    expect(stepStateFor('tunnel', status({ tunnel: { ...t, configured: false } }))).toBe('not-configured');
    expect(stepStateFor('tunnel', status({ tunnel: { ...t, supported: false } }))).toBe('optional');
    expect(stepStateFor('tunnel', status({}, [component('tunnel', 'ready')]))).toBe('done');
    expect(stepStateFor('tunnel', status({}, [component('tunnel', 'degraded')]))).toBe('needs-attention');
    expect(stepStateFor('tunnel', status({}, [component('tunnel', 'not-configured')]))).toBe('not-configured');
    expect(stepStateFor('tunnel', status())).toBe('not-configured');
  });

  it('maps Google sign-in from the oidc component', () => {
    expect(stepStateFor('google', status({}, [component('oidc', 'ready')]))).toBe('done');
    expect(stepStateFor('google', status({}, [component('oidc', 'needs-attention')]))).toBe('needs-attention');
    expect(stepStateFor('google', status({}, [component('oidc', 'unavailable')]))).toBe('optional');
    expect(stepStateFor('google', status())).toBe('not-configured');
  });

  it('maps backups from their summary', () => {
    expect(stepStateFor('backups', status())).toBe('not-configured');
    expect(stepStateFor('backups', status({ backup: { configured: false, intervalHours: null, destinations: 0, keyPresent: false } }))).toBe('not-configured');
    expect(stepStateFor('backups', status({ backup: { configured: true, intervalHours: 24, destinations: 1, keyPresent: true } }))).toBe('done');
    expect(stepStateFor('backups', status({ backup: { configured: true, intervalHours: 24, destinations: 1, keyPresent: false } }))).toBe('needs-attention');
    expect(stepStateFor('backups', status({ backup: { configured: true, intervalHours: 24, destinations: 0, keyPresent: true } }))).toBe('needs-attention');
  });

  it('maps power from the verdict or an applied change', () => {
    const power = { verdict: 'ok', sleepAcMinutes: 0, hibernateAcMinutes: 0, applied: false };
    expect(stepStateFor('power', status({ power }))).toBe('done');
    expect(stepStateFor('power', status({ power: { ...power, verdict: 'sleeps', applied: true } }))).toBe('done');
    expect(stepStateFor('power', status({ power: { ...power, verdict: 'sleeps' } }))).toBe('needs-attention');
    expect(stepStateFor('power', status({ power: { ...power, verdict: null } }, [component('power', 'needs-attention')]))).toBe('needs-attention');
    expect(stepStateFor('power', status({}, [component('power', 'ready')]))).toBe('done');
    expect(stepStateFor('power', status())).toBe('not-configured');
  });

  it('cannot derive the standby copy or the finish step', () => {
    expect(stepStateFor('standby', status())).toBe('optional');
    expect(stepStateFor('finish', status())).toBe('optional');
  });
});

describe('steps and the finish summary', () => {
  it('hides the standby step when this build has no standby bridge', () => {
    expect(stepsFor(true).map((s) => s.id)).toEqual(['status', 'tunnel', 'google', 'backups', 'power', 'standby', 'finish']);
    expect(stepsFor(false).map((s) => s.id)).toEqual(['status', 'tunnel', 'google', 'backups', 'power', 'finish']);
  });
  it('reads a skipped step that was already set up as done', () => {
    expect(finishOutcome('skipped', 'done')).toBe('done');
    expect(finishOutcome('skipped', 'not-configured')).toBe('skipped');
    expect(finishOutcome('needs-attention', 'done')).toBe('needs-attention');
    expect(finishOutcome(undefined, 'optional')).toBe('not-run');
  });
});

describe('provisionErrorText', () => {
  const codes = [
    'elevation-cancelled', 'elevation-failed', 'session-failed', 'no-session', 'stale-preview', 'refused', 'busy', 'not-installed', 'unsupported-platform', 'not-enrolled', 'timeout', 'bad-request',
  ];
  it('gives fixed friendly copy for every wizard code, never the raw message', () => {
    const seen = new Set<string>();
    for (const code of codes) {
      const text = provisionErrorText(new HubAdminError(code, 'RAW MESSAGE secret-value'));
      expect(text).not.toContain('RAW MESSAGE');
      expect(text).not.toContain('secret-value');
      expect(text.length).toBeGreaterThan(20);
      seen.add(text);
    }
    expect(seen.size).toBe(codes.length);
  });
  it('tells the owner what to do next for the session and preview codes', () => {
    expect(provisionErrorText(new HubAdminError('no-session', 'x'))).toMatch(/Start again/);
    expect(provisionErrorText(new HubAdminError('stale-preview', 'x'))).toMatch(/Preview again/);
    expect(provisionErrorText(new HubAdminError('elevation-cancelled', 'x'))).toMatch(/declined/);
  });
  it('shows a Hub code with its own message and falls back for anything else', () => {
    expect(provisionErrorText(new HubAdminError('hub-not-running', 'The Hub is not running.'))).toBe('The Hub is not running.');
    expect(provisionErrorText(new Error('boom'))).toBe('boom');
    expect(provisionErrorText('weird')).toBe('That step did not work. Try again.');
  });
  it('classifies preview-gone and already-set errors', () => {
    expect(isPreviewGone(new HubAdminError('stale-preview', 'x'))).toBe(true);
    expect(isPreviewGone(new HubAdminError('refused', 'x'))).toBe(true);
    expect(isPreviewGone(new HubAdminError('busy', 'x'))).toBe(false);
    expect(isAlreadySet(new HubAdminError('conflict', 'x'))).toBe(true);
    expect(isAlreadySet(new HubAdminError('hub-conflict', 'x'))).toBe(true);
    expect(isAlreadySet(new Error('conflict'))).toBe(false);
  });
});

describe('sessionClosedText', () => {
  it('has plain copy for each reason and a default', () => {
    expect(sessionClosedText('idle')).toMatch(/inactivity/);
    expect(sessionClosedText('cancelled')).toMatch(/declined/);
    expect(sessionClosedText('failed')).toMatch(/unexpectedly/);
    expect(sessionClosedText('ended')).toMatch(/ended/);
    expect(sessionClosedText(undefined)).toBe(sessionClosedText('ended'));
  });
});
