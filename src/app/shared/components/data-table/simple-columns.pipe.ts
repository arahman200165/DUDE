import { Pipe, PipeTransform } from '@angular/core';
import { DataTableColumn } from './data-table';

/**
 * Adapts a plain `readonly string[]` header list (the former `app-data-table` API — dynamic
 * columns known only at runtime, e.g. parsed CSV headers) into positional `DataTableColumn`
 * defs, so a dynamic-columns consumer can migrate with a template-only change instead of writing
 * out column defs by hand (DUDE_PRD.md §21 Phase 30C.2).
 */
@Pipe({ name: 'simpleColumns' })
export class SimpleColumnsPipe implements PipeTransform {
  transform(headers: readonly string[]): readonly DataTableColumn<readonly string[]>[] {
    return headers.map((header, index) => ({
      key: String(index),
      header,
      value: (row: readonly string[]) => row[index] ?? '',
    }));
  }
}
