import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { exploreIpv6 } from "@dude/tool-engine/tools/ipv6-explorer/ipv6-explorer-logic";

@Component({
  selector: 'app-ipv6-explorer',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './ipv6-explorer.html',
})
export class Ipv6Explorer {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('ipv6-explorer', 'input', 'session', '2001:0db8:0000:0000:0000:0000:0000:0001');

  protected readonly result = computed(() => (this.input().trim() === '' ? null : exploreIpv6(this.input())));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }
}
