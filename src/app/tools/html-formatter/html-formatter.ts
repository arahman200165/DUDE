import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { HtmlFormatMode, formatHtml } from './html-format-logic';

const SAMPLE_HTML = `<div class="card">
<h2>Title</h2>
<p>Some <em>text</em> content.</p>
<img src="photo.jpg">
</div>`;

@Component({
  selector: 'app-html-formatter',
  imports: [ToolShell, ErrorPanel, CopyButton, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './html-formatter.html',
})
export class HtmlFormatter {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('html-formatter', 'input', 'session', SAMPLE_HTML);
  protected readonly mode = this.persistence.signal<HtmlFormatMode>('html-formatter', 'mode', 'local', 'pretty');

  protected readonly result = computed(() => formatHtml(this.input(), this.mode()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: HtmlFormatMode): void {
    this.mode.set(mode);
  }
}
