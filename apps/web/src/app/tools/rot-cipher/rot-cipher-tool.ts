import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { RotMode, applyRot } from "@dude/tool-engine/tools/rot-cipher/rot-cipher";

@Component({
  selector: 'app-rot-cipher',
  imports: [ToolShell, CopyButton],
  templateUrl: './rot-cipher-tool.html',
})
export class RotCipherTool {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<RotMode>('rot-cipher', 'mode', 'local', 'rot13');
  protected readonly input = this.persistence.signal('rot-cipher', 'input', 'session', 'Hello, World!');

  protected readonly output = computed(() => applyRot(this.input(), this.mode()));

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setMode(mode: RotMode): void {
    this.mode.set(mode);
  }

  protected swap(): void {
    this.input.set(this.output());
  }

  protected clear(): void {
    this.input.set('');
  }
}
