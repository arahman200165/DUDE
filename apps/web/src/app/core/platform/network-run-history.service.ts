import { Injectable, inject, signal } from '@angular/core';
import { BOOT_SNAPSHOT } from '../persistence/device-store/boot-snapshot';
import type { NetworkRun } from './network-diagnostics.service';
import { NETWORK_RUN_REPOSITORY, importLegacyNetworkRuns, recordToRun, runToRecord } from './network-run-repository';
import { currentPlatformBridge } from './platform-bridge.adapter';

const MAX_BYTES = 50_000_000;

function scrub(run: NetworkRun): NetworkRun {
  const { headers: _headers, body: _body, clientIdentity: _identity, dkimHeaders: _dkimHeaders, ...request } = run.request;
  const result = run.result && typeof run.result === 'object' ? { ...run.result as Record<string, unknown> } : run.result;
  if (result && typeof result === 'object') { delete (result as Record<string, unknown>)['bodyBase64']; delete (result as Record<string, unknown>)['pcapngBase64']; }
  if (result && typeof result === 'object' && (result as Record<string, unknown>)['headers']) { const headers = { ...(result as Record<string, unknown>)['headers'] as Record<string, unknown> }; for (const name of Object.keys(headers)) if (['set-cookie', 'authorization', 'proxy-authorization'].includes(name.toLowerCase())) delete headers[name]; (result as Record<string, unknown>)['headers'] = headers; }
  return { ...run, request, result };
}

/** Only user-selected completed runs are stored; restoring never starts a job. Scrubbing stays here, before any repository sees a run. */
@Injectable({ providedIn: 'root' })
export class NetworkRunHistoryService {
  readonly saved = signal<readonly NetworkRun[]>([]);
  readonly error = signal('');
  private readonly repository = inject(NETWORK_RUN_REPOSITORY);
  /** Desktop only: the old IndexedDB runs move into the device store before the first read or write. */
  private readonly ready: Promise<void> = this.repository.kind === 'device'
    ? importLegacyNetworkRuns(this.repository, currentPlatformBridge(), inject(BOOT_SNAPSHOT))
    : Promise.resolve();

  constructor() { if (this.repository.kind === 'device' || typeof indexedDB !== 'undefined') void this.refresh(); }

  async refresh(): Promise<void> {
    try {
      await this.ready;
      this.saved.set((await this.repository.list()).flatMap((record) => recordToRun(record) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (error) { this.fail(error); }
  }
  async save(run: NetworkRun): Promise<void> {
    const record = runToRecord(scrub(run));
    if (record.sizeBytes > MAX_BYTES) { this.error.set('This result exceeds the 50 MB history limit.'); return; }
    try {
      await this.ready;
      const result = await this.repository.add(record);
      if (!result.ok) { this.error.set('This result exceeds the 50 MB history limit.'); return; }
      await this.refresh();
    } catch (error) { this.fail(error); }
  }
  async delete(id: string): Promise<void> {
    try { await this.ready; await this.repository.remove(id); await this.refresh(); }
    catch (error) { this.fail(error); }
  }
  async clear(): Promise<void> {
    try { await this.ready; await this.repository.clear(); this.saved.set([]); }
    catch (error) { this.fail(error); }
  }
  private fail(error: unknown): void { this.error.set(error instanceof Error ? error.message : String(error)); }
}
