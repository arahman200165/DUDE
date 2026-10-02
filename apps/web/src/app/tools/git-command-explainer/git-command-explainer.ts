import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { explainGitCommand } from "@dude/tool-engine/tools/git-command-explainer/git-command-explainer-logic";

@Component({
  selector: 'app-git-command-explainer',
  imports: [ToolShell],
  templateUrl: './git-command-explainer.html',
})
export class GitCommandExplainer {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal(
    'git-command-explainer',
    'input',
    'session',
    'git rebase --onto develop feature-old feature-new',
  );

  protected readonly tokens = computed(() => explainGitCommand(this.input()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }
}
