import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { rankSelectors } from "@dude/tool-engine/tools/css-specificity-calculator/css-specificity-logic";

@Component({
  selector: 'app-css-specificity-calculator',
  imports: [ToolShell],
  templateUrl: './css-specificity-calculator.html',
})
export class CssSpecificityCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal(
    'css-specificity-calculator',
    'input',
    'session',
    '#header .nav a:hover, .nav a, a',
  );

  protected readonly ranked = computed(() => rankSelectors(this.input()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }
}
