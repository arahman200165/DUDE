import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { KeyValueEditor } from '../../shared/components/key-value-editor/key-value-editor';
import { PersistenceService } from '../../core/persistence/persistence.service';
import type { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import { decodeSecretData, encodeSecretData, toSecretDataYaml } from "@dude/tool-engine/tools/k8s-secret-base64/k8s-secret-base64-logic";

type Mode = 'encode' | 'decode';

@Component({
  selector: 'app-k8s-secret-base64',
  imports: [ToolShell, CopyButton, KeyValueEditor],
  templateUrl: './k8s-secret-base64.html',
})
export class K8sSecretBase64 {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<Mode>('k8s-secret-base64', 'mode', 'local', 'encode');
  protected readonly pairs = this.persistence.signal<readonly KeyValuePair[]>('k8s-secret-base64', 'pairs', 'session', [
    { key: 'username', value: 'admin' },
  ]);

  protected readonly fields = computed(() => (this.mode() === 'encode' ? encodeSecretData(this.pairs()) : decodeSecretData(this.pairs())));
  protected readonly yaml = computed(() => toSecretDataYaml(this.fields()));

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onPairsChange(pairs: readonly KeyValuePair[]): void {
    this.pairs.set(pairs);
  }
}
