import { Component, computed, inject, signal } from '@angular/core';
import Papa from 'papaparse';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { GenerateResult, RANDOM_DATA_FIELDS, RANDOM_DATA_GROUPS, generateRows } from './random-data-fields';

type OutputView = 'table' | 'csv' | 'json';

const DEFAULT_FIELD_KEYS: readonly string[] = ['fullName', 'email', 'phoneNumber', 'streetAddress', 'city'];

@Component({
  selector: 'app-random-data-generator',
  imports: [ToolShell, ErrorPanel, CopyButton, WorkbenchTable, SimpleColumnsPipe],
  templateUrl: './random-data-generator.html',
})
export class RandomDataGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly groups = RANDOM_DATA_GROUPS;
  protected readonly fieldsByGroup = this.groups.map((group) => ({
    group,
    fields: RANDOM_DATA_FIELDS.filter((field) => field.group === group),
  }));

  protected readonly selectedKeys = this.persistence.signal<readonly string[]>(
    'random-data-generator',
    'selectedKeys',
    'local',
    DEFAULT_FIELD_KEYS,
  );
  protected readonly rowCount = this.persistence.signal('random-data-generator', 'rowCount', 'local', 10);
  protected readonly seedInput = this.persistence.signal('random-data-generator', 'seedInput', 'local', '');
  protected readonly outputView = this.persistence.signal<OutputView>(
    'random-data-generator',
    'outputView',
    'local',
    'table',
  );

  private readonly generatedSignal = signal<GenerateResult | null>(null);
  protected readonly generated = this.generatedSignal.asReadonly();

  protected readonly csvText = computed(() => {
    const result = this.generated();
    if (!result || !result.ok) return '';
    return Papa.unparse({ fields: [...result.columns], data: result.rows.map((row) => [...row]) });
  });

  protected readonly jsonText = computed(() => {
    const result = this.generated();
    if (!result || !result.ok) return '';
    const objects = result.rows.map((row) => Object.fromEntries(result.columns.map((column, i) => [column, row[i]])));
    return JSON.stringify(objects, null, 2);
  });

  constructor() {
    this.generate();
  }

  protected isSelected(key: string): boolean {
    return this.selectedKeys().includes(key);
  }

  protected toggleField(key: string): void {
    const current = this.selectedKeys();
    this.selectedKeys.set(current.includes(key) ? current.filter((k) => k !== key) : [...current, key]);
  }

  protected clearSelection(): void {
    this.selectedKeys.set([]);
  }

  protected onRowCountChange(event: Event): void {
    this.rowCount.set(Number((event.target as HTMLInputElement).value));
  }

  protected onSeedChange(event: Event): void {
    this.seedInput.set((event.target as HTMLInputElement).value);
  }

  protected setOutputView(view: OutputView): void {
    this.outputView.set(view);
  }

  protected generate(): void {
    const seedText = this.seedInput().trim();
    const seed = seedText === '' ? undefined : Number(seedText);
    this.generatedSignal.set(
      generateRows({
        fieldKeys: this.selectedKeys(),
        rowCount: this.rowCount(),
        seed: seed !== undefined && !Number.isNaN(seed) ? seed : undefined,
      }),
    );
  }
}
