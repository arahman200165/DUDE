import { Injectable } from '@angular/core';

/**
 * One-shot, in-memory-only transfer from the Smart Paste page to a target tool's own input signal.
 * Deliberately never touches `PersistenceService` — see `AGENTS.md` in this directory. A value that
 * is never consumed (the user navigates away without following a suggestion, or hard-refreshes)
 * simply vanishes; nothing detected or prefilled by this feature is ever persisted.
 */
@Injectable({ providedIn: 'root' })
export class PasteHandoffService {
  private readonly pending = new Map<string, string>();

  offer(toolId: string, value: string): void {
    this.pending.set(toolId, value);
  }

  consume(toolId: string): string | undefined {
    const value = this.pending.get(toolId);
    this.pending.delete(toolId);
    return value;
  }
}
