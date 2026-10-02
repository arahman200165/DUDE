import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { textToBytesUtf8, bytesToTextUtf8 } from "@dude/tool-engine/shared/utils/byte-codec";
import { BASE_N_MODES, BaseNMode, decodeToBytes, encodeBytes } from "@dude/tool-engine/tools/base-n-encoder/base-n-codec";

type Direction = 'encode' | 'decode';

@Component({
  selector: 'app-base-n-encoder',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './base-n-encoder.html',
})
export class BaseNEncoder {
  private readonly persistence = inject(PersistenceService);

  protected readonly modes = BASE_N_MODES;

  protected readonly direction = this.persistence.signal<Direction>('base-n-encoder', 'direction', 'local', 'encode');
  protected readonly mode = this.persistence.signal<BaseNMode>('base-n-encoder', 'mode', 'local', 'base58');
  protected readonly input = this.persistence.signal('base-n-encoder', 'input', 'session', 'Hello, world!');

  protected readonly result = computed(() => {
    if (this.direction() === 'encode') {
      return { ok: true as const, value: encodeBytes(textToBytesUtf8(this.input()), this.mode()) };
    }

    const decoded = decodeToBytes(this.input(), this.mode());
    if (!decoded.ok) return decoded;
    return bytesToTextUtf8(decoded.value);
  });

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setDirection(direction: Direction): void {
    this.direction.set(direction);
  }

  protected setMode(mode: BaseNMode): void {
    this.mode.set(mode);
  }

  protected swap(): void {
    const current = this.result();
    this.input.set(current.ok ? current.value : '');
    this.direction.set(this.direction() === 'encode' ? 'decode' : 'encode');
  }

  protected clear(): void {
    this.input.set('');
  }
}
