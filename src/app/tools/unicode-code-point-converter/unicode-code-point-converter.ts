import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { formatCodePoint, parseBulkCodePoints, parseCodePointInput } from './code-point-convert';

type Mode = 'single' | 'bulk';

@Component({
  selector: 'app-unicode-code-point-converter',
  imports: [ToolShell, CopyButton, DataTable, SimpleColumnsPipe],
  templateUrl: './unicode-code-point-converter.html',
})
export class UnicodeCodePointConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<Mode>('unicode-code-point-converter', 'mode', 'local', 'single');
  protected readonly singleInput = this.persistence.signal('unicode-code-point-converter', 'singleInput', 'session', 'A');
  protected readonly bulkInput = this.persistence.signal('unicode-code-point-converter', 'bulkInput', 'session', '');

  protected readonly singleResult = computed(() => {
    const codePoint = parseCodePointInput(this.singleInput());
    return codePoint === null ? null : formatCodePoint(codePoint);
  });

  protected readonly bulkColumns = ['Input', 'U+', 'Decimal', 'HTML Dec', 'HTML Hex', 'JS Escape', 'UTF-8 Hex'] as const;

  protected readonly bulkRows = computed(() =>
    parseBulkCodePoints(this.bulkInput()).map(({ token, notations }) =>
      notations
        ? [token, notations.uPlus, notations.decimal, notations.htmlDecimal, notations.htmlHex, notations.jsEscape, notations.utf8Hex]
        : [token, '—', '—', '—', '—', '—', 'Unrecognized'],
    ),
  );

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onSingleInputChange(event: Event): void {
    this.singleInput.set((event.target as HTMLInputElement).value);
  }

  protected onBulkInputChange(event: Event): void {
    this.bulkInput.set((event.target as HTMLTextAreaElement).value);
  }
}
