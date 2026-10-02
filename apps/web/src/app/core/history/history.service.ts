import { Injectable, signal } from '@angular/core';
import {
  clearAllEntries,
  countAll,
  countByTool,
  deleteAllByTool,
  deleteEntry,
  deleteOldestByTool,
  deleteOldestOverall,
  deleteOlderThan,
  getEntry,
  listByTool,
  listRecent,
  putEntry,
} from './history-db';
import { HistoryEntry, MAX_ENTRIES_PER_TOOL, MAX_ENTRY_AGE_MS, MAX_ENTRY_SIZE_BYTES, MAX_TOTAL_ENTRIES, createHistoryEntry } from "@dude/domain/core/history/history.model";

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

  constructor() {
    // Guards against ever starting the refresh chain in an environment with no `indexedDB` at all
    // (every real browser has it) rather than letting the resulting rejection propagate through
    // Angular's DI factory during construction.
    if (typeof indexedDB !== 'undefined') void this.refresh();
  }

  async record(toolId: string, summary: string, state: Readonly<Record<string, unknown>>): Promise<void> {
    const serialized = JSON.stringify(state);
    const oversized = serialized.length > MAX_ENTRY_SIZE_BYTES;
    const entry: HistoryEntry = oversized
      ? { ...createHistoryEntry(toolId, summary, { preview: serialized.slice(0, 1000) }), truncated: true }
      : createHistoryEntry(toolId, summary, state);

    try {
      await putEntry(entry);
    } catch (error) {
      if (!(await this.recoverFromQuotaError(entry))) {
        this.lastError.set('History storage is full; some entries may not be saved.');
        console.warn('[HistoryService] failed to record entry', error);
        return;
      }
    }

    try {
      await this.enforceRetention(toolId);
    } catch (error) {
      console.warn('[HistoryService] failed to enforce retention', error);
    }
    await this.refresh();
  }

  async listByTool(toolId: string, limit = MAX_ENTRIES_PER_TOOL): Promise<HistoryEntry[]> {
    try {
      return await listByTool(toolId, limit);
    } catch (error) {
      console.warn('[HistoryService] failed to list entries', error);
      return [];
    }
  }

  async getById(id: string): Promise<HistoryEntry | undefined> {
    try {
      return await getEntry(id);
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
    await this.runMutation(() => deleteEntry(id), 'delete entry');
  }

  async clearTool(toolId: string): Promise<void> {
    await this.runMutation(() => deleteAllByTool(toolId), 'clear tool history');
  }

  async clearAll(): Promise<void> {
    await this.runMutation(() => clearAllEntries(), 'clear all history');
  }

  private async recoverFromQuotaError(entry: HistoryEntry): Promise<boolean> {
    try {
      const total = await countAll();
      await deleteOldestOverall(Math.max(1, Math.floor(total * 0.1)));
      await putEntry(entry);
      return true;
    } catch {
      return false;
    }
  }

  private async enforceRetention(toolId: string): Promise<void> {
    const perTool = await countByTool(toolId);
    if (perTool > MAX_ENTRIES_PER_TOOL) await deleteOldestByTool(toolId, perTool - MAX_ENTRIES_PER_TOOL);

    const total = await countAll();
    if (total > MAX_TOTAL_ENTRIES) await deleteOldestOverall(total - MAX_TOTAL_ENTRIES);

    await deleteOlderThan(new Date(Date.now() - MAX_ENTRY_AGE_MS).toISOString());
  }

  private async refresh(): Promise<void> {
    try {
      this.recent.set(await listRecent(RECENT_FEED_SIZE));
    } catch (error) {
      console.warn('[HistoryService] failed to refresh recent entries', error);
    }
  }

  private async runMutation(operation: () => Promise<void>, label: string): Promise<void> {
    try {
      await operation();
    } catch (error) {
      console.warn(`[HistoryService] failed to ${label}`, error);
      return;
    }
    await this.refresh();
  }
}
