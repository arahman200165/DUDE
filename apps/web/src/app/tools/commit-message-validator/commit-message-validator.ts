import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { validateCommitMessage } from "@dude/tool-engine/tools/commit-message-validator/commit-message-validator-logic";

@Component({
  selector: 'app-commit-message-validator',
  imports: [ToolShell],
  templateUrl: './commit-message-validator.html',
})
export class CommitMessageValidator {
  private readonly persistence = inject(PersistenceService);

  protected readonly message = this.persistence.signal('commit-message-validator', 'message', 'session', 'feat(auth): add login page');

  protected readonly issues = computed(() => validateCommitMessage(this.message()));

  protected onInput(event: Event): void {
    this.message.set((event.target as HTMLTextAreaElement).value);
  }
}
