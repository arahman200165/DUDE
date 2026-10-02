import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { convertStructuredData, StructuredFormat } from "@dude/tool-engine/tools/structured-data-converter/universal-convert";

const FORMATS: readonly StructuredFormat[] = ['json', 'yaml', 'xml', 'toml', 'csv'];
const FORMAT_LABEL: Record<StructuredFormat, string> = { json: 'JSON', yaml: 'YAML', xml: 'XML', toml: 'TOML', csv: 'CSV' };

@Component({
  selector: 'app-structured-data-converter',
  imports: [ToolShell, SplitPane, ErrorPanel],
  templateUrl: './structured-data-converter.html',
})
export class StructuredDataConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly formats = FORMATS;
  protected readonly formatLabel = FORMAT_LABEL;

  protected readonly input = this.persistence.signal('structured-data-converter', 'input', 'session', '');
  protected readonly fromFormat = this.persistence.signal<StructuredFormat>('structured-data-converter', 'fromFormat', 'local', 'json');
  protected readonly toFormat = this.persistence.signal<StructuredFormat>('structured-data-converter', 'toFormat', 'local', 'yaml');
  protected readonly paneRatio = this.persistence.signal('structured-data-converter', 'paneRatio', 'local', 0.5);

  protected readonly result = computed(() => convertStructuredData(this.input(), this.fromFormat(), this.toFormat()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFromFormatChange(event: Event): void {
    this.fromFormat.set((event.target as HTMLSelectElement).value as StructuredFormat);
  }

  protected onToFormatChange(event: Event): void {
    this.toFormat.set((event.target as HTMLSelectElement).value as StructuredFormat);
  }

  protected swap(): void {
    const current = this.result();
    if (current.ok) this.input.set(current.output);
    const from = this.fromFormat();
    this.fromFormat.set(this.toFormat());
    this.toFormat.set(from);
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(output: string): void {
    void navigator.clipboard.writeText(output);
  }
}
