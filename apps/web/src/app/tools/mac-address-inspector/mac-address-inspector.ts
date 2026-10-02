import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { inspectMac } from "@dude/tool-engine/tools/mac-address-inspector/mac-address-inspector-logic";

@Component({
  selector: 'app-mac-address-inspector',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './mac-address-inspector.html',
})
export class MacAddressInspector {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('mac-address-inspector', 'input', 'session', '00:1B:63:AA:BB:CC');

  protected readonly result = computed(() => (this.input().trim() === '' ? null : inspectMac(this.input())));

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }
}
