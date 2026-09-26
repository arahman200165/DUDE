import { Injectable } from '@angular/core';

/**
 * One-shot, in-memory-only hand-off from Smart File Drop's ranked candidate list to a target
 * tool's own file input — mirrors `core/paste-detect/paste-handoff.service.ts` exactly, except the
 * offered value is a `File` (which can't round-trip through `PersistenceService`'s JSON storage at
 * all, unlike Smart Paste's plain string). A value offered and never consumed (the user picks a
 * different tool, or the target tool doesn't opt in — see `AGENTS.md`) simply vanishes.
 */
@Injectable({ providedIn: 'root' })
export class FileDropHandoffService {
  private readonly pending = new Map<string, File>();

  offer(toolId: string, file: File): void {
    this.pending.set(toolId, file);
  }

  consume(toolId: string): File | undefined {
    const file = this.pending.get(toolId);
    this.pending.delete(toolId);
    return file;
  }
}
