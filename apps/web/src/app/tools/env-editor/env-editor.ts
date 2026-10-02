import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { KeyValueEditor } from '../../shared/components/key-value-editor/key-value-editor';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { PersistenceService } from '../../core/persistence/persistence.service';
import type { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import { parseEnv, serializeEnv } from "@dude/tool-engine/tools/env-editor/env-format";

@Component({
  selector: 'app-env-editor',
  imports: [ToolShell, CopyButton, KeyValueEditor, OpenTextFile, TextFileDrop, SaveTextFile],
  templateUrl: './env-editor.html',
})
export class EnvEditor {
  private readonly persistence = inject(PersistenceService);

  protected readonly rawText = this.persistence.signal('env-editor', 'raw', 'session', 'FOO=bar\nDATABASE_URL="postgres://localhost/app"\n');

  protected readonly pairs = computed(() => parseEnv(this.rawText()));

  protected onRawInput(event: Event): void {
    this.rawText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onPairsChange(pairs: readonly KeyValuePair[]): void {
    this.rawText.set(serializeEnv(pairs));
  }
}
