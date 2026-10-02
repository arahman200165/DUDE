import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { DEV_SNIPPETS } from "@dude/tool-engine/tools/dev-snippets-reference/dev-snippets-data";
import { filterDevSnippets } from "@dude/tool-engine/tools/dev-snippets-reference/dev-snippets-search";

@Component({
  selector: 'app-dev-snippets-reference',
  imports: [ToolShell, CopyButton],
  templateUrl: './dev-snippets-reference.html',
})
export class DevSnippetsReference {
  private readonly persistence = inject(PersistenceService);

  protected readonly filterText = this.persistence.signal('dev-snippets-reference', 'filterText', 'local', '');
  protected readonly groups = computed(() => filterDevSnippets(DEV_SNIPPETS, this.filterText()));
  protected readonly totalMatches = computed(() => this.groups().reduce((sum, g) => sum + g.entries.length, 0));
  protected readonly totalSnippets = DEV_SNIPPETS.length;

  protected onFilterInput(event: Event): void {
    this.filterText.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.filterText.set('');
  }
}
