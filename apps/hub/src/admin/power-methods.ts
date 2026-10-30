import { createHash } from 'node:crypto';
import { POWER_APPLY_ACTION, POWER_CONSEQUENCE_CLASS, POWER_REVERT_ACTION } from '@dude/contracts/hub';
import { PowerChangeError } from '../power/power-policy.js';
import type { PowerPlan, PowerPolicy } from '../power/power-policy.js';
import type { PowerReading } from '../power/powercfg.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { AdminError } from './admin-endpoint.js';
import type { AdminMethod } from './admin-endpoint.js';
import type { AdminMethodContext } from './methods.js';

const ADMIN_BINDING = 'cli';

const record = (params: unknown): Record<string, unknown> => (typeof params === 'object' && params !== null && !Array.isArray(params) ? (params as Record<string, unknown>) : {});

const timeouts = (reading: { sleepAcMinutes: number | null; hibernateAcMinutes: number | null }): { sleepAcMinutes: number | null; hibernateAcMinutes: number | null } =>
  ({ sleepAcMinutes: reading.sleepAcMinutes, hibernateAcMinutes: reading.hibernateAcMinutes });

/**
 * The machine power policy (32-SS1, Milestone 851, PD-142): `power.status|preview|apply|revert`. Credential class: the local admin pipe
 * (an elevated CLI on the Hub machine). The policy is "never sleep and never hibernate on AC power"; `apply` changes the ACTIVE power
 * plan of this computer (`powercfg /change standby-timeout-ac 0` and `hibernate-timeout-ac 0`) and `revert` puts the recorded previous
 * values back. Both are two-step under the Destructive-Action Contract: the preview changes nothing and stages a single-use 60-second
 * ConfirmationStore token bound to the observed settings (and, for a revert, the recorded previous ones), tagged `system-config`; the
 * apply re-reads the settings, refuses when they moved since the preview, runs only the previewed commands, reads them back and
 * audits (`power.changed`, `power.reverted`). No HTTP route can issue or consume the confirmation or run `powercfg`; the read-only
 * owner view is the `power` component of `GET /api/v1/provisioning`. Boundary spec: `power-methods.confirmation-boundary.spec.ts`.
 */
export function buildPowerMethods(context: AdminMethodContext, shared: { now: () => number; confirmations: ConfirmationStore }): Record<string, AdminMethod> {
  const { now, confirmations } = shared;
  const policy = (): PowerPolicy => {
    if (!context.power) throw new AdminError('unavailable', 'The power policy is not available in this context.');
    return context.power;
  };
  let applying = false;

  const digestOf = (action: string, reading: PowerReading, plan: PowerPlan): string =>
    createHash('sha256').update(JSON.stringify({
      action, hubInstanceId: context.hubInstanceId, verdict: reading.verdict, ...timeouts(reading),
      commands: plan.commands.map((c) => c.args), previous: plan.previous,
    })).digest('hex');

  const planFor = (action: 'apply' | 'revert', reading: PowerReading): PowerPlan => {
    const p = policy();
    if (reading.verdict === 'unsupported') throw new AdminError('unsupported', 'The power policy can be read and changed only on a Windows Hub; it is not available in this deployment.');
    if (reading.verdict === 'unknown') throw new AdminError('unavailable', 'The power settings could not be read (powercfg gave output this Hub does not understand), so nothing can be changed safely.');
    if (action === 'apply') {
      const plan = p.planApply(reading);
      if (plan.commands.length === 0) throw new AdminError('conflict', 'This computer already never sleeps or hibernates on AC power. Nothing to change.');
      return plan;
    }
    const plan = p.planRevert(reading);
    if (plan === null) throw new AdminError('conflict', 'There is no recorded power setting to restore (the policy was not applied by this Hub).');
    return plan;
  };

  const summaryOf = (plan: PowerPlan) => ({
    action: plan.action,
    scope: 'AC (plugged in) timeouts of the active power plan of this computer; battery settings are not changed.',
    before: { sleepAcMinutes: plan.before.sleepAcMinutes, hibernateAcMinutes: plan.before.hibernateAcMinutes },
    after: { sleepAcMinutes: plan.after.sleepAcMinutes, hibernateAcMinutes: plan.after.hibernateAcMinutes },
    commands: plan.commands.map((c) => c.display),
    ...(plan.action === 'apply'
      ? { revertCommands: plan.commands.map((c) => `powercfg /change ${c.args[1]!} ${String(plan.previous[c.setting] ?? 0)}`), revertWith: 'dude-hub power revert' }
      : { restores: plan.previous }),
    restartRequired: false,
    why: 'A Hub computer that sleeps or hibernates drops the tunnel and misses scheduled backups.',
  });

  const consume = (action: string, token: unknown, reading: PowerReading, plan: PowerPlan): void => {
    if (typeof token !== 'string' || token.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
    const result = confirmations.consumeDetailed({ token, action, digest: digestOf(action, reading, plan), bindingId: ADMIN_BINDING, now: now() });
    if (result === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
    if (result === 'digest-mismatch') throw new AdminError('conflict', 'The power settings changed since the preview. Run the preview again.');
  };

  const changeError = (error: unknown): AdminError => {
    if (error instanceof PowerChangeError) return new AdminError('power-failed', error.message, { reason: error.reason });
    return new AdminError('power-failed', 'The power change failed.', { reason: 'failed' });
  };

  const run = async (action: 'apply' | 'revert', params: unknown): Promise<unknown> => {
    const token = record(params)['confirmToken'];
    if (typeof token !== 'string' || token.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
    const p = policy();
    if (applying) throw new AdminError('conflict', 'Another power change is in progress.');
    applying = true;
    try {
      const reading = await p.read();
      const plan = planFor(action, reading);
      consume(action === 'apply' ? POWER_APPLY_ACTION : POWER_REVERT_ACTION, token, reading, plan);
      let after: PowerReading;
      try {
        after = action === 'apply' ? await p.apply(plan) : await p.revert(plan);
      } catch (error) {
        throw changeError(error);
      }
      return { action, verdict: after.verdict, before: plan.before, after: timeouts(after), commands: plan.commands.map((c) => c.display), restartRequired: false };
    } finally {
      applying = false;
    }
  };

  return {
    /** A live read plus what the Hub remembers; writes nothing and needs no confirmation. */
    'power.status': async () => {
      const p = policy();
      const status = await p.status();
      const previous = p.state().previous;
      return { ...status, revertAvailable: previous !== undefined, ...(previous !== undefined ? { previous } : {}) };
    },

    /** Step one: reads the settings and stages a single-use confirmation. Changes nothing, audits nothing. */
    'power.preview': async (params) => {
      const action = record(params)['action'];
      if (action !== 'apply' && action !== 'revert') throw new AdminError('bad-request', 'action must be "apply" or "revert".');
      const reading = await policy().read();
      const plan = planFor(action, reading);
      const at = now();
      const confirmAction = action === 'apply' ? POWER_APPLY_ACTION : POWER_REVERT_ACTION;
      const confirmToken = confirmations.issue({ action: confirmAction, digest: digestOf(confirmAction, reading, plan), bindingId: ADMIN_BINDING, now: at });
      return { confirmToken, expiresAt: ConfirmationStore.expiresAt(at), consequenceClass: [...POWER_CONSEQUENCE_CLASS], summary: summaryOf(plan) };
    },

    /** Step two: re-reads, refuses a moved state, runs the previewed commands, reads back and audits. */
    'power.apply': (params) => run('apply', params),
    'power.revert': (params) => run('revert', params),
  };
}
