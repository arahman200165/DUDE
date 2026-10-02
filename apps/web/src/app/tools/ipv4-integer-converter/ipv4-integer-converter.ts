import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { convertIpv4Integer, type Ipv4IntDirection } from "@dude/tool-engine/tools/ipv4-integer-converter/ipv4-integer-converter-logic";

@Component({
  selector: 'app-ipv4-integer-converter',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './ipv4-integer-converter.html',
})
export class Ipv4IntegerConverter {
  private readonly persistence = inject(PersistenceService);

  protected readonly direction = this.persistence.signal<Ipv4IntDirection>('ipv4-integer-converter', 'direction', 'local', 'ip-to-int');
  protected readonly input = this.persistence.signal('ipv4-integer-converter', 'input', 'session', '192.168.1.1');

  protected readonly result = computed(() => convertIpv4Integer(this.input(), this.direction()));

  protected setDirection(direction: Ipv4IntDirection): void {
    this.direction.set(direction);
  }

  protected onInput(event: Event): void {
    this.input.set((event.target as HTMLInputElement).value);
  }
}
