import type { HubTunnelStatusResponse } from '@dude/contracts/hub';
import type { ComponentOutcome, ProvisioningComponent, ProvisioningContext } from '../types.js';
import { readExpectedSecrets } from './secrets.js';

/** The connector-token purpose (kept as a literal here: the secret store module is imported only by its allowlisted users). */
const TUNNEL_PURPOSE = 'tunnel.connectorToken';

const TURN_ON = 'On the Hub machine, in an elevated terminal: dude-hub network tunnel on --hostname <your-domain> --token-stdin';

/**
 * The managed Cloudflare Tunnel (32-SS1, Milestone 837, PD-142, PD-143). Read-only: provisioning never turns the tunnel on, because
 * that widens exposure and is the elevated two-step `dude-hub network tunnel on`. The state comes from the running Hub's tunnel
 * runtime (`context.tunnel`); the provisioning `check` is cheap and never starts, stops or probes the connector itself.
 *
 * - Windows only (PD-141): elsewhere the component is `unavailable` by design.
 * - `not-configured`: no tunnel in \`hub.json\` and no token expected.
 * - `ready`: connected to the Cloudflare edge.
 * - \`degraded\`: connecting, restarting, or was connected and stopped answering (the detail says which).
 * - \`needs-attention\`: the connector failed, or the token is missing: a tunnel is configured without one, or the store says a token is
 *   expected (it was entered before a restore) and none is held, so it must be entered again.
 */
export const tunnelComponent: ProvisioningComponent = {
  id: 'tunnel',
  check(context: ProvisioningContext): ComponentOutcome {
    if (context.platform !== 'win32') return { state: 'unavailable', detail: 'The managed tunnel runs only in the Windows Hub; it is not available in this deployment.' };
    const status: HubTunnelStatusResponse | undefined = context.tunnel?.();
    const expected = context.store.state === 'ready' && readExpectedSecrets(context.store.db).includes(TUNNEL_PURPOSE);
    if (status === undefined) {
      return expected
        ? { state: 'needs-attention', detail: 'A tunnel connector token was entered before and must be entered again if it is not on this machine.', nextAction: TURN_ON }
        : { state: 'not-configured', detail: 'No managed tunnel is configured.', nextAction: TURN_ON };
    }
    if (!status.configured) {
      if (expected && !status.tokenPresent) return { state: 'needs-attention', detail: 'The tunnel connector token must be entered again (it never travels in a backup), and the tunnel turned on.', nextAction: TURN_ON };
      return { state: 'not-configured', detail: 'No managed tunnel is configured.', nextAction: TURN_ON };
    }
    if (!status.tokenPresent) return { state: 'needs-attention', detail: 'The tunnel is configured but no connector token is stored on this machine.', nextAction: TURN_ON };
    switch (status.state) {
      case 'ready': return { state: 'ready', detail: `Connected through Cloudflare for ${status.hostname ?? 'the configured domain'}.` };
      case 'connecting': return { state: 'degraded', detail: 'Connecting to Cloudflare.', nextAction: 'Wait a minute, then check: dude-hub network tunnel status' };
      case 'degraded': return { state: 'degraded', detail: 'The tunnel was connected and stopped answering.', nextAction: 'dude-hub network tunnel status' };
      case 'failed': return { state: 'needs-attention', detail: `The tunnel connector could not stay up (${status.lastError ?? 'unknown'}).`, nextAction: 'dude-hub network tunnel status' };
      case 'stopped': return { state: 'degraded', detail: 'The tunnel is configured but the connector is not running.', nextAction: 'Restart the Hub service; if it persists: dude-hub network tunnel status' };
      case 'not-configured': return { state: 'not-configured', detail: 'No managed tunnel is configured.', nextAction: TURN_ON };
    }
  },
};
