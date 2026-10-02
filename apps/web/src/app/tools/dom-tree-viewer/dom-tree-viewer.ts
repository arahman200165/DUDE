import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { TreeView } from '../../shared/components/tree-view/tree-view';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { buildDomTree } from './dom-tree-logic';

const SAMPLE_HTML = `<div class="card">
  <h2>Title</h2>
  <p>Some <em>text</em> content.</p>
  <!-- a comment -->
</div>`;

@Component({
  selector: 'app-dom-tree-viewer',
  imports: [ToolShell, ErrorPanel, TreeView],
  templateUrl: './dom-tree-viewer.html',
})
export class DomTreeViewer {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('dom-tree-viewer', 'input', 'session', SAMPLE_HTML);

  protected readonly result = computed(() => buildDomTree(this.input()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }
}
