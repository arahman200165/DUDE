import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { convertQuantity } from './k8s-quantity-converter-logic';

@Component({
  selector: 'app-k8s-quantity-converter',
  imports: [ToolShell, ErrorPanel, WorkbenchTable, SimpleColumnsPipe],
  templateUrl: './k8s-quantity-converter.html',
})
export class K8sQuantityConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('k8s-quantity-converter', 'input', 'session', '500m');

  protected readonly result = computed(() => convertQuantity(this.input()));
  protected readonly tableRows = computed(() => {
    const current = this.result();
    return current.ok ? current.conversions.map((conversion) => [conversion.unit, conversion.formatted]) : [];
  });

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }
}
