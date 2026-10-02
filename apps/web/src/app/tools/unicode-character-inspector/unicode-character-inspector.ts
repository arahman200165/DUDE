import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { analyzeCharacters } from "@dude/tool-engine/tools/unicode-character-inspector/unicode-char-analyze";

@Component({
  selector: 'app-unicode-character-inspector',
  imports: [ToolShell, DataTable, SimpleColumnsPipe],
  templateUrl: './unicode-character-inspector.html',
})
export class UnicodeCharacterInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('unicode-character-inspector', 'input', 'session', '');

  protected readonly analysis = computed(() => analyzeCharacters(this.input()));

  protected readonly columns = ['Char', 'Code Point', 'UTF-8', 'UTF-16', 'Category', 'Block', 'Name'] as const;

  protected readonly rows = computed(() =>
    this.analysis().entries.map((entry) => [
      entry.char,
      `${entry.codePointHex} (${entry.codePointDecimal})`,
      entry.utf8Bytes,
      entry.utf16Units,
      `${entry.categoryAbbreviation} — ${entry.categoryLabel}`,
      entry.block,
      entry.name,
    ]),
  );

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.input.set('');
  }
}
