import type { HubProvisioningResponse } from '@dude/contracts/hub';
import { PROVISIONING_COMMANDS } from './types.js';

/** What a Hub reports when nothing can be checked (no provisioning wired, or a check that could not run): absent, never guessed. */
export function unprovisionedReport(at: Date): HubProvisioningResponse {
  return { overall: 'not-provisioned', checkedAt: at.toISOString(), lastRun: null, components: [], secrets: [], commands: [...PROVISIONING_COMMANDS] };
}
