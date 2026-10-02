import { Injectable, inject, signal } from '@angular/core';
import { HistoryEntry, MAX_ENTRIES_PER_TOOL, MAX_ENTRY_SIZE_BYTES, createHistoryEntry } from "@dude/domain/core/history/history.model";
import { BOOT_SNAPSHOT } from '../persistence/device-store/boot-snapshot';
import { currentPlatformBridge } from '../platform/platform-bridge.adapter';
import { HISTORY_REPOSITORY, entryToRecord, importLegacyHistory, jsonByteLength, recordToEntry } from './history-repository';

const RECENT_FEED_SIZE = 500;

/**
 * Local, cross-tool history (DUDE_PRD.md §21 Phase 21 Item 5) — see `core/history/AGENTS.md` for
 * the eligibility rule and `core/workspace/AGENTS.md` for the shared `<id>.workspace-step.ts`
 * adapter this reads from. IndexedDB-backed (`history-db.ts`) since a growing log of past entries
 * doesn't fit `PersistenceService`'s "one JSON blob per key" model.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  readonly recent = signal<readonly HistoryEntry[]>([]);
  readonly lastError = signal<string | null>(null);
  private readonly repository = inject(HISTORY_REPOSITORY);
  /** Desktop only: the old IndexedDB history moves into the device store before the first read or write. */
  private readonly ready: Promise<void> = this.repository.kind === 'device'
    ? importLegacyHistory(this.repository, currentPlatformBridge(), inject(BOOT_SNAPSHOT))
    : Promise.resolve();

  constructor() {
    // Guards against ever starting the refresh chain in an environment with no `indexedDB` at all
    // (every real browser has it) rather than letting the resulting rejection propagate through
    // Angular's DI factory during construction.
    if (this.repository.kind === 'device' || typeof indexedDB !== 'undefined') void this.refresh();
  }

  async record(toolId: string, summary: string, state: Readonly<Record<string, unknown>>): Promise<void> {
    await this.ready;
    let entry: HistoryEntry = createHistoryEntry(toolId, summary, state);
    if (jsonByteLength(entry) > MAX_ENTRY_SIZE_BYTES) {
      entry = { ...createHistoryEntry(toolId, summary, { preview: JSON.stringify(state).slice(0, 1000) }), truncated: true };
    }

    try {
      const result = await this.repository.add(entryToRecord(entry));
      if (!result.ok) {
        this.lastError.set('This history entry is too large to save.');
        return;
      }
    } catch (error) {
      this.lastError.set('History storage is full; some entries may not be saved.');
      console.warn('[HistoryService] failed to record entry', error);
      return;
    }
    await this.refresh();
  }

  async listByTool(toolId: string, limit = MAX_ENTRIES_PER_TOOL): Promise<HistoryEntry[]> {
    try {
      await this.ready;
      const records = await this.repository.listByTool(toolId);
      return records.slice(0, limit).flatMap((record) => recordToEntry(record) ?? []);
    } catch (error) {
      console.warn('[HistoryService] failed to list entries', error);
      return [];
    }
  }

  async getById(id: string): Promise<HistoryEntry | undefined> {
    try {
      await this.ready;
      const record = await this.repository.get(id);
      return record ? recordToEntry(record) : undefined;
    } catch (error) {
      console.warn('[HistoryService] failed to get entry', error);
      return undefined;
    }
  }

  /**
   * Every mutating method below never throws to its caller — a storage failure (quota, a browser
   * blocking IndexedDB in a private-browsing mode, or simply not existing in this environment)
   * must never break the user action that triggered it (deleting a tool's own history, or the
   * app-wide "clear all local data" button), matching DUDE_PRD.md §29's "fail clearly," not
   * "fail loudly and break something else."
   */
  async deleteOne(id: string): Promise<void> {
    await this.runMutation(() => this.repository.remove(id), 'delete entry');
  }

  async clearTool(toolId: string): Promise<void> {
    await this.runMutation(() => this.repository.clearTool(toolId), 'clear tool history');
  }

  async clearAll(): Promise<void> {
    await this.runMutation(() => this.repository.clear(), 'clear all history');
  }

  private async refresh(): Promise<void> {
    try {
      await this.ready;
      this.recent.set((await this.repository.listRecent(RECENT_FEED_SIZE)).flatMap((record) => recordToEntry(record) ?? []));
    } catch (error) {
      console.warn('[HistoryService] failed to refresh recent entries', error);
    }
  }

  private async runMutation(operation: () => Promise<void>, label: string): Promise<void> {
    try {
      await this.ready;
      await operation();
    } catch (error) {
      console.warn(`[HistoryService] failed to ${label}`, error);
      return;
    }
    await this.refresh();
  }
}
