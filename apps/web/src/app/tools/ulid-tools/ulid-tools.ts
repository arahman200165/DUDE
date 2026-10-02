import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PasteHandoffService } from '../../core/paste-detect/paste-handoff.service';
import { generateUlid, inspectUlid } from "@dude/tool-engine/tools/ulid-tools/ulid-logic";

@Component({
  selector: 'app-ulid-tools',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './ulid-tools.html',
})
export class UlidTools {
  private readonly persistence = inject(PersistenceService);

  protected readonly monotonic = this.persistence.signal('ulid-tools', 'monotonic', 'local', false);
  protected readonly generated = this.persistence.signal<readonly string[]>('ulid-tools', 'generated', 'session', []);
  protected readonly inspectInput = this.persistence.signal('ulid-tools', 'inspect', 'session', '');

  protected readonly inspection = computed(() => (this.inspectInput() === '' ? null : inspectUlid(this.inspectInput())));

  constructor() {
    // Smart Paste-Detection prefill (DUDE_PRD.md §21 Phase 21 Item 3) — see PasteHandoffService.
    const handoff = inject(PasteHandoffService).consume('ulid-tools');
    if (handoff !== undefined) this.inspectInput.set(handoff);
  }

  protected generate(): void {
    this.generated.update((list) => [generateUlid(this.monotonic()), ...list].slice(0, 20));
  }

  protected clearGenerated(): void {
    this.generated.set([]);
  }

  protected toggleMonotonic(): void {
    this.monotonic.update((value) => !value);
  }

  protected onInspectInput(event: Event): void {
    this.inspectInput.set((event.target as HTMLInputElement).value);
  }
}
