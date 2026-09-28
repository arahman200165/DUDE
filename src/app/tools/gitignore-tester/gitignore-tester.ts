import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { WorkbenchTable } from '../../shared/components/workbench-table/workbench-table';
import { SimpleColumnsPipe } from '../../shared/components/workbench-table/simple-columns.pipe';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { testGitignorePaths } from './gitignore-tester-logic';

@Component({
  selector: 'app-gitignore-tester',
  imports: [ToolShell, WorkbenchTable, SimpleColumnsPipe],
  templateUrl: './gitignore-tester.html',
})
export class GitignoreTester {
  private readonly persistence = inject(PersistenceService);

  protected readonly gitignoreText = this.persistence.signal('gitignore-tester', 'gitignore', 'session', 'node_modules/\n*.log\n!important.log');
  protected readonly pathsText = this.persistence.signal(
    'gitignore-tester',
    'paths',
    'session',
    'node_modules/\nnode_modules/left-pad/index.js\nsrc/index.ts\ndebug.log\nimportant.log',
  );

  protected readonly results = computed(() => testGitignorePaths(this.gitignoreText(), this.pathsText().split('\n')));

  protected readonly tableRows = computed(() =>
    this.results().map((result) => [result.path, result.ignored ? 'Ignored' : 'Tracked', result.matchedRule ?? '']),
  );

  protected onGitignoreInput(event: Event): void {
    this.gitignoreText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onPathsInput(event: Event): void {
    this.pathsText.set((event.target as HTMLTextAreaElement).value);
  }
}
