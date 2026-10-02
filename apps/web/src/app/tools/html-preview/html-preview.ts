import { Component, effect, inject, signal, viewChild } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { OpenTextFile, OpenedTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { recordImportedFileFlags } from '../../core/text-file-input/imported-file-flags';
import { PreviewBackground } from "@dude/tool-engine/shared/components/preview-background/preview-background-style";
import { PreviewBackgroundChips, PreviewBackgroundTarget } from '../../shared/components/preview-background/preview-background';
import { LiveHtmlPreview, LivePreviewEvent } from './live-html-preview';

const DEFAULT_SOURCE = `<!DOCTYPE html>
<html>
  <body>
    <h1>Hello!</h1>
    <script>console.log('Preview is live.');<\/script>
  </body>
</html>`;

const DEBOUNCE_MS = 500;
const DEFAULT_TIMEOUT_MS = 5000;

export interface HtmlPreviewLogLine {
  readonly level: string;
  readonly text: string;
}

@Component({
  selector: 'app-html-preview',
  imports: [PreviewBackgroundChips, PreviewBackgroundTarget, ToolShell, LiveHtmlPreview, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './html-preview.html',
})
export class HtmlPreview {
  private readonly persistence = inject(PersistenceService);

  protected readonly source = this.persistence.signal('html-preview', 'source', 'session', DEFAULT_SOURCE);
  protected readonly previewBg = this.persistence.signal<PreviewBackground>('html-preview', 'preview-background', 'local', 'theme');
  protected readonly importedNeedsApproval = signal(sessionStorage.getItem('dude:desktop:html-preview-manual') === 'true');
  protected readonly debouncedSource = signal(this.importedNeedsApproval() ? '' : this.source());
  protected readonly timeoutMs = DEFAULT_TIMEOUT_MS;

  protected readonly logs = signal<readonly HtmlPreviewLogLine[]>([]);

  protected readonly preview = viewChild.required(LiveHtmlPreview);

  constructor() {
    effect((onCleanup) => {
      const value = this.source();
      if (this.importedNeedsApproval()) return;
      const handle = setTimeout(() => {
        this.logs.set([]);
        this.debouncedSource.set(value);
      }, DEBOUNCE_MS);
      onCleanup(() => clearTimeout(handle));
    });
  }

  protected onSourceChange(event: Event): void {
    this.source.set((event.target as HTMLTextAreaElement).value);
  }

  protected onPreviewEvent(event: LivePreviewEvent): void {
    if (event.kind === 'log') {
      this.logs.update((logs) => [...logs, { level: event.level, text: event.args.join(' ') }]);
    } else {
      this.logs.update((logs) => [...logs, { level: 'error', text: event.message }]);
    }
  }

  /** HTML from a file gets the same approval gate as an Explorer-opened one: never auto-run it. */
  protected onFileOpened(file: OpenedTextFile): void {
    recordImportedFileFlags('imported.html');
    this.importedNeedsApproval.set(true);
    this.debouncedSource.set('');
    this.source.set(file.text);
  }

  protected approveImportedPreview(): void {
    this.importedNeedsApproval.set(false);
    sessionStorage.removeItem('dude:desktop:html-preview-manual');
    this.debouncedSource.set(this.source());
  }

  protected reload(): void {
    this.logs.set([]);
    this.preview().reload();
  }

  protected clear(): void {
    this.source.set('');
  }
}
