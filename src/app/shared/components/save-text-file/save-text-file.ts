import { Component, computed, input, signal } from '@angular/core';
import { injectCurrentTool } from '../../../core/registry/current-tool';
import { textFileInputOf } from '../../../core/text-file-input/imported-file-flags';
import { suggestSaveName } from '../../../core/text-file-input/text-file-read';
import { downloadFile } from '../../utils/download-file';
import type { OpenTextFile } from '../open-text-file/open-text-file';

interface SaveFilePickerWindow {
  showSaveFilePicker?(options: { suggestedName: string }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

/**
 * "Save…" for a tool's text output. Uses the browser's own Save As dialog
 * (`showSaveFilePicker` — Chromium, and therefore the Electron desktop app, where the OS dialog
 * handles overwrite confirmation) and falls back to an ordinary download elsewhere; either way the
 * user picks the destination, so this is not a `filesystem-write` capability in the
 * Destructive-Action Contract sense. The suggested name follows the file opened via the paired
 * `[source]` `app-open-text-file`, else the tool id — see `suggestSaveName`.
 */
@Component({
  selector: 'app-save-text-file',
  template: `
    <button
      type="button"
      class="rounded-sm border border-border px-2 py-0.5 text-ui text-text-muted hover:bg-panel-elevated disabled:opacity-50"
      [disabled]="text() === ''"
      [title]="'Save as ' + suggestedName()"
      (click)="save()"
    >
      {{ label() }}
    </button>
    @if (error(); as message) {
      <span class="ml-1.5 text-ui-xs text-error" role="alert">{{ message }}</span>
    }
  `,
  host: { class: 'inline-flex items-center' },
})
export class SaveTextFile {
  readonly text = input.required<string>();
  /** Explicit file name — otherwise derived (see class doc). */
  readonly fileName = input<string | undefined>(undefined);
  /** Output extension when it differs from the input's (e.g. `'.json'` for YAML → JSON). */
  readonly extension = input<string | undefined>(undefined);
  readonly source = input<OpenTextFile | undefined>(undefined);
  readonly mimeType = input('text/plain;charset=utf-8');
  readonly label = input('Save…');

  private readonly currentTool = injectCurrentTool();
  protected readonly error = signal<string | null>(null);

  protected readonly suggestedName = computed(() => {
    const tool = this.currentTool();
    return suggestSaveName({
      explicit: this.fileName(),
      openedName: this.source()?.lastOpenedName(),
      extension: this.extension(),
      fallbackBase: tool?.id ?? 'output',
      fallbackExtension: tool ? textFileInputOf(tool)?.extensions[0] : undefined,
    });
  });

  protected async save(): Promise<void> {
    this.error.set(null);
    const blob = new Blob([this.text()], { type: this.mimeType() });
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    if (!picker) {
      downloadFile(blob, this.suggestedName());
      return;
    }
    try {
      const handle = await picker.call(window, { suggestedName: this.suggestedName() });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      // Picker unavailable in this context (e.g. a cross-origin frame) -- a plain download still works.
      if ((err as DOMException)?.name === 'SecurityError') downloadFile(blob, this.suggestedName());
      else this.error.set('Could not save the file.');
    }
  }
}
