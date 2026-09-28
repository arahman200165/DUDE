import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { generatePhoneticCodes } from './soundex-metaphone-generate';

@Component({
  selector: 'app-soundex-metaphone',
  imports: [ToolShell, WorkbenchTable, SimpleColumnsPipe],
  templateUrl: './soundex-metaphone.html',
})
export class SoundexMetaphone {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('soundex-metaphone', 'input', 'session', '');

  protected readonly entries = computed(() => generatePhoneticCodes(this.input()));

  protected readonly columns = ['Word', 'Soundex', 'Metaphone'] as const;
  protected readonly rows = computed(() => this.entries().map((e) => [e.word, e.soundex, e.metaphone]));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }
}
