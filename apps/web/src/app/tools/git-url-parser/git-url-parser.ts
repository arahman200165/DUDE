import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { parseGitUrl } from "@dude/tool-engine/tools/git-url-parser/git-url-parser-logic";

@Component({
  selector: 'app-git-url-parser',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './git-url-parser.html',
})
export class GitUrlParser {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('git-url-parser', 'input', 'session', 'git@github.com:user/repo.git');

  protected readonly result = computed(() => (this.input().trim() === '' ? null : parseGitUrl(this.input())));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }
}
