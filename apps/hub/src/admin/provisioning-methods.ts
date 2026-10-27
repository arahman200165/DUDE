import { drainAuditOutbox } from '../savesphere-db/audit-outbox.js';
import { audit } from '../security/audit.js';
import { checkProvisioning, provision } from '../provisioning/index.js';
import type { ProvisioningOptions } from '../provisioning/index.js';
import { AdminError } from './admin-endpoint.js';
import type { AdminMethod } from './admin-endpoint.js';
import type { AdminMethodContext } from './methods.js';

/**
 * Parameters of `provision.run`. Today none: the run takes no input. The wizard's secrets (the tunnel connector token, a client secret;
 * Milestones 837 and 853) will arrive here as one optional `secrets` object that the CLI reads from standard input and sends over
 * this pipe, never as a command-line argument; its validation belongs to that milestone, so an unknown key is refused rather than
 * ignored. Nothing in a refusal echoes a parameter name or value.
 */
export function parseProvisionParams(params: unknown): Record<string, never> {
  if (params === undefined || params === null) return {};
  if (typeof params !== 'object' || Array.isArray(params)) throw new AdminError('bad-request', 'The parameters must be an object.');
  if (Object.keys(params).length > 0) throw new AdminError('bad-request', 'provision.run takes no parameters.');
  return {};
}

/**
 * `provision.run` and `provision.status` (32-SS1, Milestone 835, PD-153). Credential class: the local admin pipe (an elevated
 * CLI on the Hub machine; there is no network credential and no route reaches these methods). `provision.run` is additive and
 * idempotent, so it needs no confirmation token, but it changes state at the owner's request and therefore writes a
 * `provisioning.run` audit event (through the content store's outbox, in the same transaction as the run record).
 * `provision.status` writes nothing and never creates `savesphere.db`.
 */
export function buildProvisioningMethods(context: AdminMethodContext, shared: { now: () => number }): Record<string, AdminMethod> {
  const paths = (): NonNullable<AdminMethodContext['paths']> => {
    if (!context.paths) throw new AdminError('unavailable', 'Provisioning is not available in this context.');
    return context.paths;
  };
  const options = (): ProvisioningOptions => ({
    hubInstanceId: context.hubInstanceId,
    now: shared.now,
    ...(context.provisioningTest ?? {}),
    ...(context.queueRunning ? { queueRunning: context.queueRunning() } : {}),
    ...(context.tunnel ? { tunnel: () => context.tunnel!.status() } : {}),
  });
  return {
    'provision.run': async (params) => {
      parseProvisionParams(params);
      const target = paths();
      try {
        const run = await provision(target, {
          ...options(),
          drainAudit: (store) => { drainAuditOutbox(store, context.db, (input) => audit(context.db, input), shared.now); },
        });
        try { context.onProvisioned?.(); } catch { /* the status cache only expires sooner */ }
        return { report: run.report, created: run.created, restartRequired: run.restartRequired, failed: run.failed };
      } catch {
        // The cause can carry a path or an operating-system message; the Hub log and the next status say what is wrong.
        throw new AdminError('provision-failed', 'Provisioning could not complete. Run "dude-hub provision status" for the component states.');
      }
    },
    'provision.status': async () => {
      const target = paths();
      try {
        return { report: await checkProvisioning(target, options()) };
      } catch {
        throw new AdminError('provision-failed', 'The provisioning status could not be read.');
      }
    },
  };
}
