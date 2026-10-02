import { Injectable } from '@angular/core';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { writeStorageValue } from '../workspace/workspace-storage-bridge';
import { recordImportedFileFlags, textFileInputOf } from './imported-file-flags';

/**
 * Generic text prefill for any tool with a declared text input (`fileInput`, or a `desktopOpen`
 * input key — see `textFileInputOf`) — no per-tool
 * `consume()` call. Exactly the mechanism `core/platform/desktop-open.service.ts` already uses for
 * Explorer "Open with DUDE": write the text into the tool's own `PersistenceService` storage key
 * *before* navigating, so the tool's `persistence.signal(...)` reads it on its normal synchronous
 * construction-time read. The value lands exactly where the tool's own declared policy would have
 * put it the moment the user typed or pasted it — nothing is persisted that the tool wouldn't
 * persist itself.
 *
 * The originating file name (if any) is kept in memory only, so the tool's `app-open-text-file`
 * button can show "notes.md" for a dashboard drop the same way it does for its own Open file….
 */
@Injectable({ providedIn: 'root' })
export class TextInputHandoffService {
  private readonly pending = new Map<string, { readonly name?: string; readonly text: string }>();

  /** Writes `text` into `tool`'s text input (`textFileInputOf`); `false` when it has none. */
  offer(tool: ToolDefinition, text: string, fileName?: string): boolean {
    const input = textFileInputOf(tool);
    if (!input) return false;
    writeStorageValue(tool.id, input.key, input.policy ?? 'session', text);
    if (fileName) recordImportedFileFlags(fileName);
    this.pending.set(tool.id, { name: fileName, text });
    return true;
  }

  /**
   * Whether a hand-off just arrived for `toolId` — for a tool whose text input is mode-gated to
   * switch into the mode that shows it (the same contract as `FileDropHandoffService.has`).
   */
  has(toolId: string): boolean {
    return this.pending.has(toolId);
  }

  /** Non-consuming: the pending hand-off's file name, for a tool that picks its mode by extension. */
  pendingFileName(toolId: string): string | undefined {
    return this.pending.get(toolId)?.name;
  }

  /** One-shot: the file name a hand-off of exactly `text` came from, for this tool. */
  takeFileName(toolId: string, text: string): string | undefined {
    const entry = this.pending.get(toolId);
    if (!entry || entry.text !== text) return undefined;
    this.pending.delete(toolId);
    return entry.name;
  }
}
