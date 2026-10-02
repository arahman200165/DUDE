import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PasteHandoffService } from '../../core/paste-detect/paste-handoff.service';
import { generateKsuid, inspectKsuid } from "@dude/tool-engine/tools/ksuid-tools/ksuid-logic";

@Component({
  selector: 'app-ksuid-tools',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './ksuid-tools.html',
})
export class KsuidTools {
  private readonly persistence = inject(PersistenceService);

  protected readonly generated = this.persistence.signal<readonly string[]>('ksuid-tools', 'generated', 'session', []);
  protected readonly inspectInput = this.persistence.signal('ksuid-tools', 'inspect', 'session', '');

  protected readonly inspection = computed(() => (this.inspectInput() === '' ? null : inspectKsuid(this.inspectInput())));

  constructor() {
    // Smart Paste-Detection prefill (DUDE_PRD.md §21 Phase 21 Item 3) — see PasteHandoffService.
    const handoff = inject(PasteHandoffService).consume('ksuid-tools');
    if (handoff !== undefined) this.inspectInput.set(handoff);
  }

  protected generate(): void {
    this.generated.update((list) => [generateKsuid(), ...list].slice(0, 20));
  }

  protected clearGenerated(): void {
    this.generated.set([]);
  }

  protected onInspectInput(event: Event): void {
    this.inspectInput.set((event.target as HTMLInputElement).value);
  }
}
