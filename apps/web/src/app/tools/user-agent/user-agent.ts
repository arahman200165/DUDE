import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { parseUserAgent } from "@dude/tool-engine/tools/user-agent/ua-parse";

@Component({
  selector: 'app-user-agent',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './user-agent.html',
})
export class UserAgent {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('user-agent', 'input', 'session', '');
  protected readonly result = computed(() => parseUserAgent(this.input()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected useMyBrowser(): void {
    this.input.set(navigator.userAgent);
  }

  protected clear(): void {
    this.input.set('');
  }
}
