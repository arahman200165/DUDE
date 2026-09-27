import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { injectCurrentTool } from '../../../core/registry/current-tool';
import { TextInputHandoffService } from '../../../core/text-file-input/text-input-handoff.service';
import { textFileInputOf } from '../../../core/text-file-input/imported-file-flags';
import { acceptFromExtensions, readTextFile } from '../../../core/text-file-input/text-file-read';

export interface OpenedTextFile {
  readonly name: string;
  readonly text: string;
}

/**
 * "Open file…" for a text input: picks a file, validates it (size cap, binary/UTF-16 rejection —
 * `core/text-file-input/text-file-read.ts`), and emits its text for the host tool to put in its own
 * input signal. Pair it with the `appTextFileDrop` directive on the input element so dropping a
 * file there goes through this exact same path:
 *
 *   <app-open-text-file #open [text]="input()" (textLoaded)="input.set($event)" />
 *   <textarea [appTextFileDrop]="open" ...></textarea>
 *
 * Shows the opened file's name until the text is edited away from what was loaded — including a
 * file handed off from the dashboard's Smart File Drop (`TextInputHandoffService`). The picker
 * filter defaults to the host tool's declared `fileInput` extensions; "All files" stays selectable.
 */
@Component({
  selector: 'app-open-text-file',
  templateUrl: './open-text-file.html',
  host: { class: 'inline-flex min-w-0 flex-wrap items-center gap-1.5' },
})
export class OpenTextFile implements OnInit {
  /** The host input's current value — only used to know when to stop showing the file name. */
  readonly text = input.required<string>();
  /** `<input accept>` override; defaults to the host tool's `fileInput`/`desktopOpen` extensions. */
  readonly accept = input<string | undefined>(undefined);
  readonly label = input('Open file…');

  readonly textLoaded = output<string>();
  readonly fileOpened = output<OpenedTextFile>();

  private readonly currentTool = injectCurrentTool();
  private readonly handoff = inject(TextInputHandoffService);
  private readonly loaded = signal<OpenedTextFile | null>(null);

  /** The last file opened here, kept even after edits — `app-save-text-file` derives its name from it. */
  readonly lastOpenedName = computed(() => this.loaded()?.name ?? null);
  protected readonly visibleName = computed(() => {
    const loaded = this.loaded();
    return loaded && loaded.text === this.text() ? loaded.name : null;
  });
  protected readonly error = signal<string | null>(null);
  protected readonly effectiveAccept = computed(() => {
    const tool = this.currentTool();
    return this.accept() ?? acceptFromExtensions(tool ? textFileInputOf(tool)?.extensions : undefined);
  });

  ngOnInit(): void {
    const toolId = this.currentTool()?.id;
    const name = toolId ? this.handoff.takeFileName(toolId, this.text()) : undefined;
    if (name) this.loaded.set({ name, text: this.text() });
  }

  /** Public so `appTextFileDrop` routes a dropped file through the identical validation. */
  async load(file: File): Promise<void> {
    this.error.set(null);
    const result = await readTextFile(file);
    if (!result.ok) {
      this.error.set(result.error);
      return;
    }
    const opened = { name: result.name, text: result.text };
    this.loaded.set(opened);
    this.textLoaded.emit(result.text);
    this.fileOpened.emit(opened);
  }

  protected onPicked(event: Event): void {
    const picker = event.target as HTMLInputElement;
    const file = picker.files?.[0];
    picker.value = '';
    if (file) void this.load(file);
  }
}
