import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { TextInputHandoffService } from '../../core/text-file-input/text-input-handoff.service';
import { OpenTextFile, OpenedTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { htmlToJsx, jsxToHtml } from './html-jsx-logic';

type Direction = 'html-to-jsx' | 'jsx-to-html';

const SAMPLE_HTML = `<div class="card" tabindex="0">
  <label for="name">Name</label>
  <input type="text" id="name" style="color: red; font-size: 14px;">
</div>`;

@Component({
  selector: 'app-html-jsx-converter',
  imports: [ToolShell, ErrorPanel, CopyButton, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './html-jsx-converter.html',
})
export class HtmlJsxConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly direction = this.persistence.signal<Direction>('html-jsx-converter', 'direction', 'local', 'html-to-jsx');
  protected readonly input = this.persistence.signal('html-jsx-converter', 'input', 'session', SAMPLE_HTML);

  protected readonly result = computed(() => (this.direction() === 'html-to-jsx' ? htmlToJsx(this.input()) : jsxToHtml(this.input())));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  constructor() {
    // Same rule for a file dropped on the dashboard as for one opened here.
    const handedOff = inject(TextInputHandoffService).pendingFileName('html-jsx-converter');
    if (handedOff) this.setDirectionFromFileName(handedOff);
  }

  /** An opened .jsx/.tsx file converts to HTML, an .html/.htm file to JSX; anything else keeps the current direction. */
  protected onFileOpened(file: OpenedTextFile): void {
    this.setDirectionFromFileName(file.name);
    this.input.set(file.text);
  }

  private setDirectionFromFileName(name: string): void {
    if (/\.[jt]sx$/i.test(name)) this.direction.set('jsx-to-html');
    else if (/\.html?$/i.test(name)) this.direction.set('html-to-jsx');
  }

  protected setDirection(direction: Direction): void {
    this.direction.set(direction);
  }
}
