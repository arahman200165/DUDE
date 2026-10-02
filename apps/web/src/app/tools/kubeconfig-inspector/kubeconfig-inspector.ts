import { KubeconfigInspector_secretEntries } from "@dude/tool-engine/tools/kubeconfig-inspector/kubeconfig-inspector.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { consumeWorkspaceState } from "@dude/tool-engine/core/workspace/workspace-handoff";
import { inspectKubeconfig, redactSecret, type KubeconfigUser } from "@dude/tool-engine/tools/kubeconfig-inspector/kubeconfig-inspector-logic";

@Component({
  selector: 'app-kubeconfig-inspector',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './kubeconfig-inspector.html',
})
export class KubeconfigInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('kubeconfig-inspector', 'input', 'none', '');
  protected readonly revealed = signal(false);

  constructor() {
    // Workspace tab-restore hand-off (DUDE_PRD.md §21 Phase 21 Item 4) — see
    // kubeconfig-inspector.workspace-step.ts. In-memory only, never touches storage.
    const workspaceState = consumeWorkspaceState('kubeconfig-inspector');
    if (typeof workspaceState?.['input'] === 'string') this.input.set(workspaceState['input']);
  }

  protected readonly result = computed(() => (this.input().trim() === '' ? null : inspectKubeconfig(this.input())));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected toggleRevealed(): void {
    this.revealed.update((value) => !value);
  }

  protected displaySecret(value: string): string {
    return this.revealed() ? value : redactSecret(value);
  }
  protected secretEntries = KubeconfigInspector_secretEntries;

}
