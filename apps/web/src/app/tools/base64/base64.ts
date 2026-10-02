import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PasteHandoffService } from '../../core/paste-detect/paste-handoff.service';
import { decodeBase64, encodeBase64 } from "@dude/crypto/base64-codec";

type Base64Mode = 'encode' | 'decode';

@Component({
  selector: 'app-base64',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './base64.html',
})
export class Base64Tool {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<Base64Mode>('base64', 'mode', 'local', 'encode');
  protected readonly input = this.persistence.signal('base64', 'input', 'session', '');

  constructor() {
    // Smart Paste-Detection prefill (DUDE_PRD.md §21 Phase 21 Item 3) — see PasteHandoffService.
    const handoff = inject(PasteHandoffService).consume('base64');
    if (handoff !== undefined) {
      this.input.set(handoff);
      this.mode.set('decode');
    }
  }

  protected readonly result = computed(() =>
    this.mode() === 'encode' ? encodeBase64(this.input()) : decodeBase64(this.input()),
  );

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: Base64Mode): void {
    this.mode.set(mode);
  }

  protected swap(): void {
    const current = this.result();
    this.input.set(current.ok ? current.value : '');
    this.mode.set(this.mode() === 'encode' ? 'decode' : 'encode');
  }

  protected clear(): void {
    this.input.set('');
  }

  protected copy(): void {
    const current = this.result();
    if (current.ok) void navigator.clipboard.writeText(current.value);
  }
}
