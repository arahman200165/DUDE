import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { buildBearerHeader } from "@dude/tool-engine/tools/bearer-token-builder/bearer-token-builder-logic";

@Component({
  selector: 'app-bearer-token-builder',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './bearer-token-builder.html',
})
export class BearerTokenBuilder {
  private readonly persistence = inject(PersistenceService);

  protected readonly token = this.persistence.signal('bearer-token-builder', 'token', 'none', '');
  protected readonly result = computed(() => (this.token() === '' ? null : buildBearerHeader(this.token())));

  protected onTokenInput(event: Event): void {
    this.token.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.token.set('');
  }
}
