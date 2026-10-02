import { CssSelectorTester_formatElement } from "@dude/tool-engine/tools/css-selector-tester/css-selector-tester.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { testSelector } from './css-selector-tester-logic';

const SAMPLE_HTML = `<ul id="list">
  <li class="item first">One</li>
  <li class="item">Two</li>
  <li class="item" data-active="true">Three</li>
</ul>`;

@Component({
  selector: 'app-css-selector-tester',
  imports: [ToolShell, OpenTextFile, TextFileDrop],
  templateUrl: './css-selector-tester.html',
})
export class CssSelectorTester {
  private readonly persistence = inject(PersistenceService);

  protected readonly html = this.persistence.signal('css-selector-tester', 'html', 'session', SAMPLE_HTML);
  protected readonly selector = this.persistence.signal('css-selector-tester', 'selector', 'session', '.item');

  protected readonly result = computed(() => testSelector(this.html(), this.selector()));

  protected onHtmlChange(event: Event): void {
    this.html.set((event.target as HTMLTextAreaElement).value);
  }

  protected onSelectorChange(event: Event): void {
    this.selector.set((event.target as HTMLInputElement).value);
  }
  protected formatElement = CssSelectorTester_formatElement;

}
