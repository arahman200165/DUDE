import type { JournalEngine } from '@dude/contracts';
import type { MutationJournal, JournalEntryBase } from '../mutation-core';
import { storeCall } from './store-client';

/** `MutationJournal` over the Device State Store's `journal.*` agent methods (Phase 31B, M621). */
export class StoreJournal<E extends JournalEntryBase> implements MutationJournal<E> {
  constructor(private readonly engine: JournalEngine, private readonly maxEntries: number) {}

  async write(entry: E): Promise<void> {
    await storeCall('journal.append', { engine: this.engine, entry: entry as never });
  }

  async read(planId: string): Promise<E | null> {
    if (typeof planId !== 'string') return null;
    return (await storeCall('journal.get', { engine: this.engine, planId })) as E | null;
  }

  /** Newest first. */
  async list(): Promise<E[]> {
    return (await storeCall('journal.list', { engine: this.engine })) as unknown as E[];
  }

  async remove(planId: string): Promise<void> {
    await storeCall('journal.remove', { engine: this.engine, planId });
  }

  async trimTo(maxEntries = this.maxEntries, onRemove?: (entry: E) => Promise<void> | void): Promise<void> {
    const { removed } = await storeCall('journal.trim', { engine: this.engine, keep: maxEntries });
    for (const entry of removed as unknown as E[]) await onRemove?.(entry);
  }
}
