import type { HubProvisioningResponse } from '@dude/contracts/hub';
import type { HubPaths } from '../config/data-dir.js';
import { checkProvisioning } from './engine.js';
import type { ProvisioningOptions } from './engine.js';

/** How long the status route reuses a check (a check spawns one worker process and writes one probe blob). */
export const PROVISIONING_STATUS_TTL_MS = 60_000;

export interface ProvisioningService {
  /** The current report: the cached one while it is fresh, else a new check. Concurrent callers share one check. */
  status(): Promise<HubProvisioningResponse>;
  /** Drops the cached report (after a provisioning run), so the next read checks again. */
  invalidate(): void;
  /**
   * The cheap check at Hub start: only when `savesphere.db` exists, never creating anything, and it logs counts and the overall
   * state, never a detail sentence. Failures are swallowed.
   */
  checkAtStart(log: (event: string, detail: Record<string, unknown>) => void): Promise<void>;
}

export interface ProvisioningServiceOptions extends Omit<ProvisioningOptions, 'drainAudit'> {
  ttlMs?: number;
}

/** The read model behind `GET /api/v1/provisioning` and the start-up check; a request handler gets only `status`. */
export function createProvisioningService(paths: HubPaths, options: ProvisioningServiceOptions = {}): ProvisioningService {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? PROVISIONING_STATUS_TTL_MS;
  let cached: { at: number; report: HubProvisioningResponse } | undefined;
  let pending: Promise<HubProvisioningResponse> | undefined;
  let generation = 0;

  const status = (): Promise<HubProvisioningResponse> => {
    if (cached !== undefined && now() - cached.at < ttlMs) return Promise.resolve(cached.report);
    if (pending !== undefined) return pending;
    const started = generation;
    const run = checkProvisioning(paths, options)
      .then((report) => {
        if (started === generation) cached = { at: now(), report };
        return report;
      })
      .finally(() => { pending = undefined; });
    pending = run;
    return run;
  };

  return {
    status,
    invalidate: () => { generation += 1; cached = undefined; },
    async checkAtStart(log) {
      try {
        const report = await status();
        const counts: Record<string, number> = {};
        for (const component of report.components) counts[component.state] = (counts[component.state] ?? 0) + 1;
        log('provisioning.checked', { overall: report.overall, components: counts });
      } catch {
        log('provisioning.check-failed', {});
      }
    },
  };
}
