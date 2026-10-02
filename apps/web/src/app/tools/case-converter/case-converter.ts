import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { CASE_STYLE_OPTIONS, CaseStyle, convertCase } from "@dude/tool-engine/tools/case-converter/case-convert";

@Component({
  selector: 'app-case-converter',
  imports: [ToolShell],
  templateUrl: './case-converter.html',
})
export class CaseConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly options = CASE_STYLE_OPTIONS;

  protected readonly input = this.persistence.signal('case-converter', 'input', 'session', '');
  protected readonly style = this.persistence.signal<CaseStyle>('case-converter', 'style', 'local', 'camel');

  protected readonly result = computed(() => convertCase(this.input(), this.style()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onStyleChange(event: Event): void {
    this.style.set((event.target as HTMLSelectElement).value as CaseStyle);
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(): void {
    void navigator.clipboard.writeText(this.result());
  }
}
