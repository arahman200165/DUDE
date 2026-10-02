import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { buildConventionalCommit, COMMIT_TYPES, type CommitType } from "@dude/tool-engine/tools/conventional-commit-builder/conventional-commit-builder-logic";

@Component({
  selector: 'app-conventional-commit-builder',
  imports: [ToolShell, CopyButton],
  templateUrl: './conventional-commit-builder.html',
})
export class ConventionalCommitBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly commitTypes = COMMIT_TYPES;

  protected readonly type = this.persistence.signal<CommitType>('conventional-commit-builder', 'type', 'local', 'feat');
  protected readonly scope = this.persistence.signal('conventional-commit-builder', 'scope', 'session', '');
  protected readonly breaking = this.persistence.signal('conventional-commit-builder', 'breaking', 'session', false);
  protected readonly subject = this.persistence.signal('conventional-commit-builder', 'subject', 'session', '');
  protected readonly body = this.persistence.signal('conventional-commit-builder', 'body', 'session', '');
  protected readonly breakingDescription = this.persistence.signal('conventional-commit-builder', 'breakingDescription', 'session', '');
  protected readonly footers = this.persistence.signal('conventional-commit-builder', 'footers', 'session', '');

  protected readonly message = computed(() =>
    buildConventionalCommit({
      type: this.type(),
      scope: this.scope(),
      breaking: this.breaking(),
      subject: this.subject(),
      body: this.body(),
      breakingDescription: this.breakingDescription(),
      footers: this.footers(),
    }),
  );

  protected onTypeChange(event: Event): void {
    this.type.set((event.target as HTMLSelectElement).value as CommitType);
  }

  protected onScopeInput(event: Event): void {
    this.scope.set((event.target as HTMLInputElement).value);
  }

  protected onBreakingToggle(event: Event): void {
    this.breaking.set((event.target as HTMLInputElement).checked);
  }

  protected onSubjectInput(event: Event): void {
    this.subject.set((event.target as HTMLInputElement).value);
  }

  protected onBodyInput(event: Event): void {
    this.body.set((event.target as HTMLTextAreaElement).value);
  }

  protected onBreakingDescriptionInput(event: Event): void {
    this.breakingDescription.set((event.target as HTMLInputElement).value);
  }

  protected onFootersInput(event: Event): void {
    this.footers.set((event.target as HTMLTextAreaElement).value);
  }
}
