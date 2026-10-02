import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { testCronJobSchedule } from "@dude/tool-engine/tools/k8s-cronjob-tester/k8s-cronjob-tester-logic";

const DEFAULT_INPUT = 'apiVersion: batch/v1\nkind: CronJob\nmetadata:\n  name: my-job\nspec:\n  schedule: "*/5 * * * *"\n  concurrencyPolicy: Forbid\n';

@Component({
  selector: 'app-k8s-cronjob-tester',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './k8s-cronjob-tester.html',
})
export class K8sCronjobTester {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('k8s-cronjob-tester', 'input', 'session', DEFAULT_INPUT);
  protected readonly count = this.persistence.signal('k8s-cronjob-tester', 'count', 'local', 5);

  protected readonly result = computed(() => testCronJobSchedule(this.input(), this.count(), 'local'));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected onCountInput(event: Event): void {
    this.count.set(Number((event.target as HTMLInputElement).value));
  }
}
