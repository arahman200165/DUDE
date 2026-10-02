import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { HexTextDirection, HexTextEncoding, convertHexText } from "@dude/tool-engine/tools/hex-text-converter/hex-text-convert";

const ENCODINGS: readonly { readonly id: HexTextEncoding; readonly label: string }[] = [
  { id: 'ascii', label: 'ASCII' },
  { id: 'utf8', label: 'UTF-8' },
  { id: 'utf16le', label: 'UTF-16 LE' },
  { id: 'utf16be', label: 'UTF-16 BE' },
];

@Component({
  selector: 'app-hex-text-converter',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './hex-text-converter.html',
})
export class HexTextConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly encodings = ENCODINGS;

  protected readonly direction = this.persistence.signal<HexTextDirection>('hex-text-converter', 'direction', 'local', 'toHex');
  protected readonly encoding = this.persistence.signal<HexTextEncoding>('hex-text-converter', 'encoding', 'local', 'utf8');
  protected readonly input = this.persistence.signal('hex-text-converter', 'input', 'session', 'Hello, world!');

  protected readonly result = computed(() => convertHexText(this.input(), this.direction(), this.encoding()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setDirection(direction: HexTextDirection): void {
    this.direction.set(direction);
  }

  protected setEncoding(encoding: HexTextEncoding): void {
    this.encoding.set(encoding);
  }

  protected swap(): void {
    const current = this.result();
    this.input.set(current.ok ? current.value : '');
    this.direction.set(this.direction() === 'toHex' ? 'toText' : 'toHex');
  }

  protected clear(): void {
    this.input.set('');
  }
}
