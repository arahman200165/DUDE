import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { DiffView } from '../../shared/components/diff-view/diff-view';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { diffK8sManifests } from "@dude/tool-engine/tools/k8s-manifest-diff/k8s-manifest-diff-logic";

@Component({
  selector: 'app-k8s-manifest-diff',
  imports: [ToolShell, ErrorPanel, DiffView],
  templateUrl: './k8s-manifest-diff.html',
})
export class K8sManifestDiff {
  private readonly persistence = inject(PersistenceService);

  protected readonly before = this.persistence.signal(
    'k8s-manifest-diff',
    'before',
    'session',
    'apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod\n',
  );
  protected readonly after = this.persistence.signal(
    'k8s-manifest-diff',
    'after',
    'session',
    'apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod\n  namespace: prod\n',
  );

  protected readonly result = computed(() => diffK8sManifests(this.before(), this.after()));

  protected onBeforeInput(event: Event): void {
    this.before.set((event.target as HTMLTextAreaElement).value);
  }

  protected onAfterInput(event: Event): void {
    this.after.set((event.target as HTMLTextAreaElement).value);
  }
}
