import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DataTable } from '../../shared/components/data-table/data-table';
import { SimpleColumnsPipe } from '../../shared/components/data-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { parseGitRemotes } from './git-remote-inspector-logic';

@Component({
  selector: 'app-git-remote-inspector',
  imports: [ToolShell, DataTable, SimpleColumnsPipe],
  templateUrl: './git-remote-inspector.html',
})
export class GitRemoteInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal(
    'git-remote-inspector',
    'input',
    'session',
    'origin\tgit@github.com:user/repo.git (fetch)\norigin\tgit@github.com:user/repo.git (push)',
  );

  protected readonly entries = computed(() => parseGitRemotes(this.input()));

  protected readonly tableRows = computed(() =>
    this.entries().map((entry) => [
      entry.name,
      entry.direction,
      entry.url,
      entry.parsed?.host ?? '',
      entry.parsed?.owner ?? '',
      entry.parsed?.repo ?? '',
    ]),
  );

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }
}
