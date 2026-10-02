import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { GITIGNORE_TEMPLATES } from "@dude/tool-engine/tools/gitignore-generator/gitignore-templates-data";
import { combineGitignoreTemplates } from "@dude/tool-engine/tools/gitignore-generator/gitignore-generator-logic";

@Component({
  selector: 'app-gitignore-generator',
  imports: [ToolShell, CopyButton],
  templateUrl: './gitignore-generator.html',
})
export class GitignoreGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly templates = GITIGNORE_TEMPLATES;
  protected readonly selected = this.persistence.signal<readonly string[]>('gitignore-generator', 'selected', 'local', ['node']);

  protected readonly output = computed(() => combineGitignoreTemplates(this.selected()));

  protected toggle(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.update((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  protected isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  protected download(): void {
    downloadFile(new Blob([this.output()]), '.gitignore', 'text/plain');
  }
}
