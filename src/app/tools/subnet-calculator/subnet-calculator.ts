import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { splitSubnet, type SubnetSplitMode } from './subnet-calculator-logic';

@Component({
  selector: 'app-subnet-calculator',
  imports: [ToolShell, ErrorPanel, WorkbenchTable, SimpleColumnsPipe],
  templateUrl: './subnet-calculator.html',
})
export class SubnetCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly baseText = this.persistence.signal('subnet-calculator', 'base', 'session', '192.168.1.0/24');
  protected readonly mode = this.persistence.signal<SubnetSplitMode>('subnet-calculator', 'mode', 'local', 'count');
  protected readonly param = this.persistence.signal('subnet-calculator', 'param', 'local', 4);

  protected readonly result = computed(() => splitSubnet(this.baseText(), this.mode(), this.param()));
  protected readonly tableRows = computed(() => {
    const current = this.result();
    return current.ok
      ? current.subnets.map((subnet) => [
          `${subnet.network}/${subnet.prefixLength}`,
          subnet.broadcast,
          `${subnet.firstUsable} – ${subnet.lastUsable}`,
          String(subnet.usableHosts),
        ])
      : [];
  });

  protected onBaseInput(event: Event): void {
    this.baseText.set((event.target as HTMLInputElement).value);
  }

  protected setMode(mode: SubnetSplitMode): void {
    this.mode.set(mode);
  }

  protected onParamInput(event: Event): void {
    this.param.set(Number((event.target as HTMLInputElement).value));
  }
}
