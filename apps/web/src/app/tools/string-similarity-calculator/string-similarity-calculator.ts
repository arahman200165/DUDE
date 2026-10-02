import { StringSimilarityCalculator_percent } from "@dude/tool-engine/tools/string-similarity-calculator/string-similarity-calculator.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { compareStrings } from "@dude/tool-engine/tools/string-similarity-calculator/string-similarity";

@Component({
  selector: 'app-string-similarity-calculator',
  imports: [ToolShell],
  templateUrl: './string-similarity-calculator.html',
})
export class StringSimilarityCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly left = this.persistence.signal('string-similarity-calculator', 'left', 'session', '');
  protected readonly right = this.persistence.signal('string-similarity-calculator', 'right', 'session', '');

  protected readonly result = computed(() => compareStrings(this.left(), this.right()));

  protected onLeftChange(event: Event): void {
    this.left.set((event.target as HTMLInputElement).value);
  }

  protected onRightChange(event: Event): void {
    this.right.set((event.target as HTMLInputElement).value);
  }
  protected percent = StringSimilarityCalculator_percent;

}
