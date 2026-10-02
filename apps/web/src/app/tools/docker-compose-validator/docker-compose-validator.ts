import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { TreeView } from '../../shared/components/tree-view/tree-view';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { buildJsonTree, toTreeNode } from "@dude/tool-engine/tools/json/json-tree";
import { parseComposeDocument, validateCompose } from "@dude/tool-engine/tools/docker-compose-validator/docker-compose-validator-logic";

const DEFAULT_COMPOSE = 'services:\n  web:\n    image: nginx:1.27\n    ports:\n      - "8080:80"\n';

@Component({
  selector: 'app-docker-compose-validator',
  imports: [ToolShell, ErrorPanel, TreeView],
  templateUrl: './docker-compose-validator.html',
})
export class DockerComposeValidator {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('docker-compose-validator', 'input', 'session', DEFAULT_COMPOSE);

  protected readonly result = computed(() => validateCompose(this.input()));
  protected readonly treeNodes = computed(() => {
    const parsed = parseComposeDocument(this.input());
    return parsed.ok ? [toTreeNode(buildJsonTree(parsed.value))] : [];
  });

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }
}
