import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { formatK8sManifest, validateK8sManifest } from './k8s-manifest-validator-logic';

const DEFAULT_MANIFEST = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: my-pod\nspec:\n  containers:\n    - name: app\n      image: nginx:1.27\n';

@Component({
  selector: 'app-k8s-manifest-validator',
  imports: [ToolShell, ErrorPanel, CopyButton, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './k8s-manifest-validator.html',
})
export class K8sManifestValidator {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('k8s-manifest-validator', 'input', 'session', DEFAULT_MANIFEST);

  protected readonly result = computed(() => validateK8sManifest(this.input()));
  protected readonly formatted = computed(() => formatK8sManifest(this.input()));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected applyFormat(): void {
    const result = this.formatted();
    if (result.ok) this.input.set(result.output);
  }
}
