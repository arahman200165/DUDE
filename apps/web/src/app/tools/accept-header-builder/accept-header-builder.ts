import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { KeyValueEditor } from '../../shared/components/key-value-editor/key-value-editor';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import { buildAcceptHeader, parseAcceptHeader, sortByPreference } from "@dude/tool-engine/tools/accept-header-builder/accept-header";

@Component({
  selector: 'app-accept-header-builder',
  imports: [ToolShell, CopyButton, KeyValueEditor],
  templateUrl: './accept-header-builder.html',
})
export class AcceptHeaderBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly raw = this.persistence.signal('accept-header-builder', 'raw', 'session', 'text/html, application/json;q=0.9, */*;q=0.1');

  protected readonly pairs = computed(() => parseAcceptHeader(this.raw()));
  protected readonly sorted = computed(() => sortByPreference(this.pairs()));

  protected onRawChange(event: Event): void {
    this.raw.set((event.target as HTMLInputElement).value);
  }

  protected onPairsChange(pairs: readonly KeyValuePair[]): void {
    this.raw.set(buildAcceptHeader(pairs));
  }
}
