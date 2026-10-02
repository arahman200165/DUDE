import { K8sResourceCalculator_formatCpu, K8sResourceCalculator_formatMemory } from "@dude/tool-engine/tools/k8s-resource-calculator/k8s-resource-calculator.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { formatQuantity } from "@dude/tool-engine/tools/k8s-quantity-converter/k8s-quantity-converter-logic";
import { calculateResourceRequests } from "@dude/tool-engine/tools/k8s-resource-calculator/k8s-resource-calculator-logic";

const DEFAULT_MANIFEST =
  'spec:\n  containers:\n    - name: app\n      resources:\n        requests:\n          cpu: "250m"\n          memory: "128Mi"\n        limits:\n          cpu: "500m"\n          memory: "256Mi"\n    - name: sidecar\n      resources:\n        requests:\n          cpu: "100m"\n          memory: "64Mi"\n';

@Component({
  selector: 'app-k8s-resource-calculator',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './k8s-resource-calculator.html',
})
export class K8sResourceCalculator {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('k8s-resource-calculator', 'input', 'session', DEFAULT_MANIFEST);

  protected readonly result = computed(() => calculateResourceRequests(this.input()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }
  protected formatCpu = K8sResourceCalculator_formatCpu;

  protected formatMemory = K8sResourceCalculator_formatMemory;

}
