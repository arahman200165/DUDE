import type { ComponentOutcome, ProvisioningComponent, ProvisioningContext } from '../types.js';

const APPLY = 'On the Hub machine, in an elevated terminal: dude-hub power apply';

/**
 * The machine power policy (32-SS1, Milestone 851, PD-142): "never sleep and never hibernate on AC power", so the tunnel stays up and
 * scheduled backups run. Read-only: provisioning never changes the power plan (that is the elevated two-step `dude-hub power apply`),
 * and the check never spawns `powercfg` itself; it reports the last check the running Hub made (at start and hourly).
 *
 * - Windows only: elsewhere the component is `unavailable` by design (a Docker Hub's host power is the host's business).
 * - `not-configured`: no check has run in this process (the CLI engine, or the Hub has just started).
 * - `ready`: neither the AC sleep nor the AC hibernate timeout is set.
 * - `degraded`: a timeout is set (the computer can sleep), or the settings could not be read.
 * - `needs-attention`: the policy was in place and a later check found it changed (the owner was notified).
 */
export const powerComponent: ProvisioningComponent = {
  id: 'power',
  check(context: ProvisioningContext): ComponentOutcome {
    if (context.platform !== 'win32') return { state: 'unavailable', detail: 'The power policy is checked only on the Windows Hub; it is not available in this deployment.' };
    const status = context.power?.();
    if (status === undefined) return { state: 'not-configured', detail: 'The power policy has not been checked yet.', nextAction: 'dude-hub power status' };
    switch (status.verdict) {
      case 'ok': return { state: 'ready', detail: 'This computer does not sleep or hibernate on AC power.' };
      case 'unsupported': return { state: 'unavailable', detail: 'The power policy is checked only on the Windows Hub; it is not available in this deployment.' };
      case 'unknown': return { state: 'degraded', detail: 'The power settings could not be read, so the policy cannot be confirmed.', nextAction: 'dude-hub power status' };
      case 'needs-change':
        if (status.regressed) return { state: 'needs-attention', detail: 'This computer can sleep or hibernate on AC power again after it had been set to stay awake.', nextAction: APPLY };
        return status.optedOut
          ? { state: 'degraded', detail: 'This computer can sleep or hibernate on AC power (the policy was reverted on purpose); the tunnel and scheduled backups pause while it sleeps.', nextAction: APPLY }
          : { state: 'degraded', detail: 'This computer can sleep or hibernate on AC power; the tunnel and scheduled backups pause while it sleeps.', nextAction: APPLY };
    }
  },
};
