import { MockDataStudio_toDisplayValue } from "@dude/tool-engine/tools/mock-data-studio/mock-data-studio.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { generateMockData, parseSchema, type MockDataRow } from "@dude/tool-engine/tools/mock-data-studio/mock-data-schema";
import { formatMockDataExport, type MockDataExportFormat } from "@dude/tool-engine/tools/mock-data-studio/mock-data-export";

const DEFAULT_SCHEMA = '{\n  "name": "person.fullName",\n  "email": "internet.email",\n  "city": "location.city"\n}';

@Component({
  selector: 'app-mock-data-studio',
  imports: [ToolShell, ErrorPanel, DataTable, SimpleColumnsPipe],
  templateUrl: './mock-data-studio.html',
})
export class MockDataStudio {
  private readonly persistence = inject(PersistenceService);

  protected readonly schemaText = this.persistence.signal('mock-data-studio', 'schema', 'local', DEFAULT_SCHEMA);
  protected readonly rowCount = this.persistence.signal('mock-data-studio', 'rowCount', 'local', 10);
  protected readonly seedText = this.persistence.signal('mock-data-studio', 'seed', 'local', '');
  protected readonly tableName = this.persistence.signal('mock-data-studio', 'tableName', 'local', 'mock_data');
  protected readonly exportFormat = this.persistence.signal<MockDataExportFormat>('mock-data-studio', 'exportFormat', 'local', 'json');

  protected readonly rows = this.persistence.signal<readonly MockDataRow[]>('mock-data-studio', 'rows', 'session', []);
  protected readonly error = this.persistence.signal('mock-data-studio', 'error', 'session', '');

  protected readonly columns = computed(() => (this.rows().length > 0 ? Object.keys(this.rows()[0]) : []));
  protected readonly tableRows = computed(() => this.rows().map((row) => this.columns().map((column) => this.toDisplayValue(row[column]))));

  protected generate(): void {
    const schemaResult = parseSchema(this.schemaText());
    if (!schemaResult.ok) {
      this.error.set(schemaResult.error);
      this.rows.set([]);
      return;
    }

    const seed = this.seedText().trim() === '' ? undefined : Number(this.seedText());
    const result = generateMockData(schemaResult.schema, { rowCount: this.rowCount(), seed });
    if (!result.ok) {
      this.error.set(result.error);
      this.rows.set([]);
      return;
    }

    this.error.set('');
    this.rows.set(result.rows);
  }

  protected exportRows(): void {
    const { text, filename, mimeType } = formatMockDataExport(this.rows(), this.exportFormat(), this.tableName());
    downloadFile(new Blob([text]), filename, mimeType);
  }

  protected onSchemaInput(event: Event): void {
    this.schemaText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRowCountInput(event: Event): void {
    this.rowCount.set(Number((event.target as HTMLInputElement).value));
  }

  protected onSeedInput(event: Event): void {
    this.seedText.set((event.target as HTMLInputElement).value);
  }

  protected onTableNameInput(event: Event): void {
    this.tableName.set((event.target as HTMLInputElement).value);
  }

  protected onExportFormatChange(event: Event): void {
    this.exportFormat.set((event.target as HTMLSelectElement).value as MockDataExportFormat);
  }
  private toDisplayValue = MockDataStudio_toDisplayValue;

}
