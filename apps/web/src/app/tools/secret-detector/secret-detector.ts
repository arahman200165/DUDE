import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { consumeWorkspaceState } from "@dude/tool-engine/core/workspace/workspace-handoff";
import { detectSecrets, redactMatch } from "@dude/tool-engine/tools/secret-detector/secret-detector-logic";

@Component({
  selector: 'app-secret-detector',
  imports: [ToolShell],
  templateUrl: './secret-detector.html',
})
export class SecretDetector {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('secret-detector', 'input', 'none', '');
  protected readonly revealed = signal(false);

  constructor() {
    // Workspace tab-restore hand-off (DUDE_PRD.md §21 Phase 21 Item 4) — see
    // secret-detector.workspace-step.ts. In-memory only, never touches PersistenceService.
    const workspaceState = consumeWorkspaceState('secret-detector');
    if (typeof workspaceState?.['input'] === 'string') this.input.set(workspaceState['input']);
  }

  protected readonly findings = computed(() => detectSecrets(this.input()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected toggleRevealed(): void {
    this.revealed.update((value) => !value);
  }

  protected display(match: string): string {
    return this.revealed() ? match : redactMatch(match);
  }
}
