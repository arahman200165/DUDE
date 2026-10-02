import { OAuthTokenInspector_format } from "@dude/tool-engine/tools/oauth-token-inspector/oauth-token-inspector.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { inspectToken } from "@dude/tool-engine/tools/oauth-token-inspector/oauth-token-inspector-logic";

@Component({
  selector: 'app-oauth-token-inspector',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './oauth-token-inspector.html',
})
export class OAuthTokenInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('oauth-token-inspector', 'input', 'none', '');
  protected readonly inspection = computed(() => (this.input().trim() === '' ? null : inspectToken(this.input())));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.input.set('');
  }
  protected format = OAuthTokenInspector_format;

}
