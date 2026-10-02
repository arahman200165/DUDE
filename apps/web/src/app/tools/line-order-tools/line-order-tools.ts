import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { SortVariant, reverseLines, shuffleLines, sortLines } from "@dude/tool-engine/tools/line-order-tools/line-order-logic";

type Operation = 'sort' | 'shuffle' | 'reverse';

const SORT_VARIANTS: readonly { value: SortVariant; label: string }[] = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
  { value: 'natural', label: 'Natural' },
  { value: 'by-length', label: 'By length' },
];

@Component({
  selector: 'app-line-order-tools',
  imports: [ToolShell, CopyButton],
  templateUrl: './line-order-tools.html',
})
export class LineOrderTools {
  private readonly persistence = inject(PersistenceService);

  protected readonly sortVariants = SORT_VARIANTS;

  protected readonly input = this.persistence.signal('line-order-tools', 'input', 'session', '');
  protected readonly operation = this.persistence.signal<Operation>('line-order-tools', 'operation', 'local', 'sort');
  protected readonly sortVariant = this.persistence.signal<SortVariant>('line-order-tools', 'sortVariant', 'local', 'asc');

  protected readonly result = computed(() => {
    const text = this.input();
    switch (this.operation()) {
      case 'sort':
        return sortLines(text, this.sortVariant());
      case 'shuffle':
        return shuffleLines(text);
      case 'reverse':
        return reverseLines(text);
    }
  });

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setOperation(operation: Operation): void {
    this.operation.set(operation);
  }

  protected onSortVariantChange(event: Event): void {
    this.sortVariant.set((event.target as HTMLSelectElement).value as SortVariant);
  }

  protected apply(): void {
    this.input.set(this.result());
  }
}
