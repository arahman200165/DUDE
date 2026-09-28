import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { InvisibleCharKind, scanInvisibleChars, stripInvisibleChars } from './invisible-char-scan';

const ALL_KINDS: readonly InvisibleCharKind[] = ['control', 'zero-width', 'invisible'];

@Component({
  selector: 'app-invisible-char-scanner',
  imports: [ToolShell, DataTable, SimpleColumnsPipe, CopyButton],
  templateUrl: './invisible-char-scanner.html',
})
export class InvisibleCharScanner {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('invisible-char-scanner', 'input', 'session', '');
  protected readonly stripKinds = this.persistence.signal<readonly InvisibleCharKind[]>(
    'invisible-char-scanner',
    'stripKinds',
    'local',
    ALL_KINDS,
  );

  protected readonly allKinds = ALL_KINDS;

  protected readonly occurrences = computed(() => scanInvisibleChars(this.input()));

  protected readonly columns = ['Position', 'Code Point', 'Kind', 'Name'] as const;

  protected readonly rows = computed(() =>
    this.occurrences().map((occurrence) => [
      occurrence.position.toString(),
      occurrence.codePointHex,
      occurrence.kind,
      occurrence.name,
    ]),
  );

  protected readonly stripped = computed(() => stripInvisibleChars(this.input(), new Set(this.stripKinds())));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected isKindSelected(kind: InvisibleCharKind): boolean {
    return this.stripKinds().includes(kind);
  }

  protected toggleKind(kind: InvisibleCharKind): void {
    const current = this.stripKinds();
    this.stripKinds.set(current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]);
  }

  protected applyStrip(): void {
    this.input.set(this.stripped());
  }
}
