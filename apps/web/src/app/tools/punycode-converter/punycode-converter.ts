import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { analyzeDomainHomographRisk } from "@dude/tool-engine/shared/utils/url-homograph";
import { PunycodeDirection, convertPunycode } from "@dude/tool-engine/tools/punycode-converter/punycode-convert";

type Mode = 'convert' | 'inspect';

@Component({
  selector: 'app-punycode-converter',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './punycode-converter.html',
})
export class PunycodeConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<Mode>('punycode-converter', 'mode', 'local', 'convert');
  protected readonly direction = this.persistence.signal<PunycodeDirection>('punycode-converter', 'direction', 'local', 'toASCII');
  protected readonly input = this.persistence.signal('punycode-converter', 'input', 'session', 'münchen.de');

  protected readonly result = computed(() => convertPunycode(this.input(), this.direction()));
  protected readonly homograph = computed(() => analyzeDomainHomographRisk(this.input()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }

  protected setDirection(direction: PunycodeDirection): void {
    this.direction.set(direction);
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected swap(): void {
    const current = this.result();
    this.input.set(current.ok ? current.value : '');
    this.direction.set(this.direction() === 'toASCII' ? 'toUnicode' : 'toASCII');
  }

  protected clear(): void {
    this.input.set('');
  }
}
