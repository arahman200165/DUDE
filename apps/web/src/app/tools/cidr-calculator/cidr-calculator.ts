import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { calculateCidr } from "@dude/tool-engine/tools/cidr-calculator/cidr-calculator-logic";

@Component({
  selector: 'app-cidr-calculator',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './cidr-calculator.html',
})
export class CidrCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('cidr-calculator', 'input', 'session', '192.168.1.10/24');

  protected readonly result = computed(() => calculateCidr(this.input()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }
}
