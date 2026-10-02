import { Component, computed, inject } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { EscapeMode, escapeText, unescapeText } from "@dude/tool-engine/tools/escape-unescape-toolkit/escape-unescape";

type Direction = 'escape' | 'unescape';

const MODES: readonly { readonly id: EscapeMode; readonly label: string }[] = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'css', label: 'CSS' },
  { id: 'sql', label: 'SQL' },
  { id: 'shell', label: 'Shell (POSIX)' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'quoted-printable', label: 'Quoted-Printable' },
];

@Component({
  selector: 'app-escape-unescape-toolkit',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './escape-unescape-toolkit.html',
})
export class EscapeUnescapeToolkit {
  private readonly persistence = inject(PersistenceService);

  protected readonly modes = MODES;

  protected readonly direction = this.persistence.signal<Direction>('escape-unescape-toolkit', 'direction', 'local', 'escape');
  protected readonly mode = this.persistence.signal<EscapeMode>('escape-unescape-toolkit', 'mode', 'local', 'javascript');
  protected readonly input = this.persistence.signal('escape-unescape-toolkit', 'input', 'session', 'He said "hi"\nwith a \\ backslash');

  protected readonly result = computed(() =>
    this.direction() === 'escape' ? escapeText(this.input(), this.mode()) : unescapeText(this.input(), this.mode()),
  );

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected setDirection(direction: Direction): void {
    this.direction.set(direction);
  }

  protected setMode(mode: EscapeMode): void {
    this.mode.set(mode);
  }

  protected swap(): void {
    const current = this.result();
    this.input.set(current.ok ? current.value : '');
    this.direction.set(this.direction() === 'escape' ? 'unescape' : 'escape');
  }

  protected clear(): void {
    this.input.set('');
  }
}
