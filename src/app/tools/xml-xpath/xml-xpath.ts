import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { evaluateXPath, XPathEvalResult } from './xml-xpath-eval';

@Component({
  selector: 'app-xml-xpath',
  imports: [ToolShell, SplitPane, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './xml-xpath.html',
})
export class XmlXpath {
  private readonly persistence = inject(PersistenceService);

  protected readonly xmlInput = this.persistence.signal('xml-xpath', 'xmlInput', 'session', '');
  protected readonly expression = this.persistence.signal('xml-xpath', 'expression', 'local', '');
  protected readonly paneRatio = this.persistence.signal('xml-xpath', 'paneRatio', 'local', 0.5);

  protected readonly result = computed<XPathEvalResult>(() => evaluateXPath(this.xmlInput(), this.expression()));

  protected onXmlInputChange(event: Event): void {
    this.xmlInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onExpressionChange(event: Event): void {
    this.expression.set((event.target as HTMLInputElement).value);
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected clear(): void {
    this.xmlInput.set('');
  }

  protected copy(matches: readonly string[]): void {
    void navigator.clipboard.writeText(matches.join('\n'));
  }
}
