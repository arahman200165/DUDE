import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { buildGitCommand, GIT_SUBCOMMAND_FIELDS, GIT_SUBCOMMANDS, type GitFieldValues, type GitSubcommand } from "@dude/tool-engine/tools/git-command-builder/git-command-builder-logic";

@Component({
  selector: 'app-git-command-builder',
  imports: [ToolShell, CopyButton],
  templateUrl: './git-command-builder.html',
})
export class GitCommandBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly subcommands = GIT_SUBCOMMANDS;

  protected readonly subcommand = this.persistence.signal<GitSubcommand>('git-command-builder', 'subcommand', 'local', 'commit');
  protected readonly values = this.persistence.signal<GitFieldValues>('git-command-builder', 'values', 'session', {});

  protected readonly fields = computed(() => GIT_SUBCOMMAND_FIELDS[this.subcommand()]);
  protected readonly command = computed(() => buildGitCommand(this.subcommand(), this.values()));

  protected onSubcommandChange(event: Event): void {
    this.subcommand.set((event.target as HTMLSelectElement).value as GitSubcommand);
    this.values.set({});
  }

  protected onTextInput(fieldId: string, event: Event): void {
    this.values.update((current) => ({ ...current, [fieldId]: (event.target as HTMLInputElement).value }));
  }

  protected onBooleanToggle(fieldId: string, event: Event): void {
    this.values.update((current) => ({ ...current, [fieldId]: (event.target as HTMLInputElement).checked }));
  }

  protected textValue(fieldId: string): string {
    const value = this.values()[fieldId];
    return typeof value === 'string' ? value : '';
  }

  protected booleanValue(fieldId: string): boolean {
    return this.values()[fieldId] === true;
  }
}
