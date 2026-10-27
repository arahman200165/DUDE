import { Value } from 'typebox/value';
import { HubProvisioningResponse } from '@dude/contracts/hub';
import { AdminCallError, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ServiceDeps } from './common.js';

export type ProvisionAction = 'run' | 'status';

export interface ProvisionCommandOptions {
  action: ProvisionAction;
  /** Print only the report as JSON on standard output (progress and notes still go to standard error). */
  json?: boolean;
  dataDir?: string;
  installDir?: string;
}

/** Creating storage and measuring free space is quick, but the worker probe spawns a process, so allow longer than an ordinary call. */
const CALL_MS = 120_000;
const STATE_LABEL: Record<string, string> = { ready: 'ready', degraded: 'degraded', unavailable: 'unavailable', 'not-configured': 'not configured', 'needs-attention': 'NEEDS ATTENTION' };
const OVERALL_LABEL: Record<string, string> = {
  ready: 'Ready.',
  degraded: 'Ready, with a problem to look at.',
  'needs-attention': 'Needs attention.',
  'needs-provisioning': 'Needs provisioning: run "dude-hub provision" (and re-enter any secrets it lists).',
  'not-provisioned': 'Not provisioned yet: run "dude-hub provision".',
};

interface RunResult { report: HubProvisioningResponse; created?: string[]; restartRequired?: boolean; failed?: string[] }

/** Exit 0 for a Hub that works (`ready`, or `degraded` with a problem the owner can see); 1 when something needs the owner; never 2 (that is usage). */
export const provisionExitCode = (overall: string): number => (overall === 'ready' || overall === 'degraded' ? EXIT_OK : EXIT_FAILURE);

function humanReport(result: RunResult, ran: boolean): string {
  const { report } = result;
  const lines: string[] = [ran ? 'Provisioning finished.' : 'Provisioning status (nothing was changed).'];
  if (ran) lines.push(result.created !== undefined && result.created.length > 0 ? `  Created: ${result.created.join(', ')}` : '  Created: nothing (everything already existed).');
  const width = Math.max(0, ...report.components.map((c) => c.id.length));
  for (const component of report.components) {
    lines.push(`  ${component.id.padEnd(width)}  ${(STATE_LABEL[component.state] ?? component.state).padEnd(15)}  ${component.detail}`);
    if (component.nextAction !== undefined && component.state !== 'ready') lines.push(`  ${' '.repeat(width)}  -> ${component.nextAction}`);
  }
  if (result.failed !== undefined && result.failed.length > 0) lines.push(`  A provisioning step failed for: ${result.failed.join(', ')}.`);
  if (result.restartRequired === true) lines.push('  The content store was created while the Hub was running: restart the Hub service so the job queue starts.');
  lines.push(`Overall: ${OVERALL_LABEL[report.overall] ?? report.overall}`);
  return `${lines.join('\n')}\n`;
}

/**
 * `dude-hub provision [status] [--json]`: asks the running Hub (over the admin pipe, the Hub being the only writer of its
 * databases) to provision and check the SaveSphere components, or only to report them. `run` is additive and idempotent and needs
 * the elevated terminal on a Windows service; `status` only reads. Exit codes: 0 ready or degraded, 1 needs attention, needs
 * provisioning or a failed call, 2 usage or Hub not running. No secret travels in argv: the wizard's secrets (Milestones 837 and 853)
 * will be read from standard input and sent in the call parameters, as backup passphrases are.
 */
export async function runProvision(options: ProvisionCommandOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  if (options.action === 'run') {
    const state = await serviceState(d);
    if (state !== 'not-installed' && state !== 'unknown') {
      const refused = await requireElevated(d, 'Provisioning');
      if (refused !== null) return refused;
    }
  }
  if ((await tryAdminStatus(d, dataRoot)) === null) {
    d.err('The Hub is not running. Provisioning is done by the running Hub; start it and run this again.\n');
    return EXIT_USAGE;
  }
  try {
    const raw = (await d.call(dataRoot, options.action === 'run' ? 'provision.run' : 'provision.status', {}, CALL_MS)) as RunResult | null;
    if (raw === null || typeof raw !== 'object' || !Value.Check(HubProvisioningResponse, raw.report)) {
      d.err('The Hub returned a provisioning report this command does not understand. Update dude-hub.\n');
      return EXIT_FAILURE;
    }
    if (options.json === true) d.out(json(raw.report));
    else d.out(humanReport(raw, options.action === 'run'));
    return provisionExitCode(raw.report.overall);
  } catch (error) {
    if (error instanceof AdminCallError) {
      if (error.code === HUB_NOT_RUNNING) {
        d.err('The Hub is not running. Provisioning is done by the running Hub; start it and run this again.\n');
        return EXIT_USAGE;
      }
      if (error.code === 'timeout') {
        d.err('The Hub did not answer in time. It may still be working; run "dude-hub provision status" before trying again.\n');
        return EXIT_FAILURE;
      }
      d.err(`${error.message}\n`);
      return EXIT_FAILURE;
    }
    d.err(`${error instanceof Error ? error.message : 'Provisioning failed.'}\n`);
    return EXIT_FAILURE;
  }
}
