import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DataTable, DataTableColumn } from './data-table';
import { DataTableCellDef } from './data-table-cell.directive';

interface Row {
  readonly name: string;
  readonly uses: string;
}

const rows: readonly Row[] = [
  { name: 'Base64', uses: '9' },
  { name: 'Regex Tester', uses: '20' },
  { name: 'CSV Viewer', uses: '3' },
];

const columns: readonly DataTableColumn<Row>[] = [
  { key: 'name', header: 'Tool', value: (r) => r.name, sortable: true },
  { key: 'uses', header: 'Uses', value: (r) => r.uses, sortable: true },
];

@Component({
  imports: [DataTable],
  template: `<app-data-table [columns]="columns" [rows]="rows" [virtualizeThreshold]="100" (rowOpened)="opened = $event" />`,
})
class PlainHost {
  protected readonly columns = columns;
  protected readonly rows = rows;
  opened: Row | undefined;
}

@Component({
  imports: [DataTable, DataTableCellDef],
  template: `
    <app-data-table [columns]="columns" [rows]="rows">
      <ng-template appDataTableCell="name" let-row>
        <button type="button" class="badge">{{ row.name }} ★</button>
      </ng-template>
    </app-data-table>
  `,
})
class CustomCellHost {
  protected readonly columns = columns;
  protected readonly rows = rows;
}

describe('DataTable', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('renders header labels and one row per data row', () => {
    const fixture = TestBed.createComponent(PlainHost);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Tool');
    expect(fixture.nativeElement.querySelectorAll('[role="row"]').length).toBe(rows.length + 1);
  });

  it('sorts numerically on header click, ascending then descending then back to unsorted', () => {
    const fixture = TestBed.createComponent(PlainHost);
    fixture.detectChanges();

    const usesHeader: HTMLButtonElement = Array.from(fixture.nativeElement.querySelectorAll('[role="columnheader"] button')).find(
      (b) => (b as HTMLElement).textContent?.includes('Uses'),
    ) as HTMLButtonElement;

    function rowOrder(): string[] {
      return Array.from(fixture.nativeElement.querySelectorAll('[role="row"]'))
        .slice(1)
        .map((row) => (row as HTMLElement).textContent ?? '');
    }

    usesHeader.click();
    fixture.detectChanges();
    expect(rowOrder()[0]).toContain('CSV Viewer');

    usesHeader.click();
    fixture.detectChanges();
    expect(rowOrder()[0]).toContain('Regex Tester');
  });

  it('emits rowOpened on Enter for the keyboard-focused row', () => {
    const fixture = TestBed.createComponent(PlainHost);
    fixture.detectChanges();

    const table: HTMLElement = fixture.nativeElement.querySelector('[role="table"]');
    table.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    table.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.opened?.name).toBe('Regex Tester');
  });

  it('renders a custom cell template for a column that declares one', () => {
    const fixture = TestBed.createComponent(CustomCellHost);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.badge').length).toBe(rows.length);
    expect(fixture.nativeElement.textContent).toContain('Base64 ★');
  });
});
