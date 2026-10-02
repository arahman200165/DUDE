import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PasteHandoffService } from '../../core/paste-detect/paste-handoff.service';
import {
  generateSnowflake,
  inspectSnowflake,
  SNOWFLAKE_PRESETS,
  type SnowflakeConfig,
  type SnowflakePreset,
} from "@dude/tool-engine/tools/snowflake-id-tools/snowflake-logic";

@Component({
  selector: 'app-snowflake-id-tools',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './snowflake-id-tools.html',
})
export class SnowflakeIdTools {
  private readonly persistence = inject(PersistenceService);

  protected readonly preset = this.persistence.signal<SnowflakePreset>('snowflake-id-tools', 'preset', 'local', 'twitter');
  protected readonly customEpoch = this.persistence.signal('snowflake-id-tools', 'customEpoch', 'local', Date.now());
  protected readonly customWorkerBits = this.persistence.signal('snowflake-id-tools', 'customWorkerBits', 'local', 10);
  protected readonly customSequenceBits = this.persistence.signal('snowflake-id-tools', 'customSequenceBits', 'local', 12);
  protected readonly workerId = this.persistence.signal('snowflake-id-tools', 'workerId', 'local', 1);

  protected readonly generated = this.persistence.signal<readonly string[]>('snowflake-id-tools', 'generated', 'session', []);
  protected readonly inspectInput = this.persistence.signal('snowflake-id-tools', 'inspect', 'session', '');
  protected readonly generateError = this.persistence.signal('snowflake-id-tools', 'generateError', 'session', '');

  protected readonly config = computed<SnowflakeConfig>(() => {
    const preset = this.preset();
    if (preset === 'custom') {
      return { epoch: this.customEpoch(), workerBits: this.customWorkerBits(), sequenceBits: this.customSequenceBits() };
    }
    return SNOWFLAKE_PRESETS[preset];
  });

  protected readonly inspection = computed(() =>
    this.inspectInput() === '' ? null : inspectSnowflake(this.config(), this.inspectInput()),
  );

  constructor() {
    // Smart Paste-Detection prefill (DUDE_PRD.md §21 Phase 21 Item 3) — see PasteHandoffService.
    const handoff = inject(PasteHandoffService).consume('snowflake-id-tools');
    if (handoff !== undefined) this.inspectInput.set(handoff);
  }

  protected generate(): void {
    const result = generateSnowflake(this.config(), this.workerId());
    if (!result.ok) {
      this.generateError.set(result.error);
      return;
    }
    this.generateError.set('');
    this.generated.update((list) => [result.id, ...list].slice(0, 20));
  }

  protected clearGenerated(): void {
    this.generated.set([]);
  }

  protected onPresetChange(event: Event): void {
    this.preset.set((event.target as HTMLSelectElement).value as SnowflakePreset);
  }

  protected onCustomEpochInput(event: Event): void {
    this.customEpoch.set(Number((event.target as HTMLInputElement).value));
  }

  protected onCustomWorkerBitsInput(event: Event): void {
    this.customWorkerBits.set(Number((event.target as HTMLInputElement).value));
  }

  protected onCustomSequenceBitsInput(event: Event): void {
    this.customSequenceBits.set(Number((event.target as HTMLInputElement).value));
  }

  protected onWorkerIdInput(event: Event): void {
    this.workerId.set(Number((event.target as HTMLInputElement).value));
  }

  protected onInspectInput(event: Event): void {
    this.inspectInput.set((event.target as HTMLInputElement).value);
  }
}
