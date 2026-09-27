import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { formatStackTrace, StackTraceMode } from './stack-trace-format';

const MODE_OPTIONS: readonly { readonly id: StackTraceMode; readonly label: string }[] = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'java', label: 'Java' },
  { id: 'dotnet', label: '.NET' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
];

@Component({
  selector: 'app-stack-trace-formatter',
  imports: [ToolShell, CopyButton, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './stack-trace-formatter.html',
})
export class StackTraceFormatter {
  private readonly persistence = inject(PersistenceService);

  protected readonly modes = MODE_OPTIONS;

  protected readonly input = this.persistence.signal('stack-trace-formatter', 'input', 'session', '');
  protected readonly mode = this.persistence.signal<StackTraceMode>('stack-trace-formatter', 'mode', 'local', 'auto');
  protected readonly hideLibraryFrames = this.persistence.signal('stack-trace-formatter', 'hideLibraryFrames', 'local', false);

  protected readonly result = computed(() => formatStackTrace(this.input(), this.mode()));

  protected readonly visibleLines = computed(() => {
    const lines = this.result().trace.lines;
    return this.hideLibraryFrames() ? lines.filter((line) => line.kind !== 'frame-library') : lines;
  });

  protected readonly outputText = computed(() => this.visibleLines().map((line) => line.text).join('\n'));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: StackTraceMode): void {
    this.mode.set(mode);
  }

  protected toggleHideLibraryFrames(): void {
    this.hideLibraryFrames.set(!this.hideLibraryFrames());
  }
}
