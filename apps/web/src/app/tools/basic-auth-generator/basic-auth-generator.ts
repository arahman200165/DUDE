import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { buildBasicAuthHeader, decodeBasicAuthHeader } from "@dude/tool-engine/tools/basic-auth-generator/basic-auth-generator-logic";

type Mode = 'encode' | 'decode';

@Component({
  selector: 'app-basic-auth-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './basic-auth-generator.html',
})
export class BasicAuthGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<Mode>('basic-auth-generator', 'mode', 'local', 'encode');

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly header = signal('');

  protected readonly encodeResult = computed(() => buildBasicAuthHeader(this.username(), this.password()));
  protected readonly decodeResult = computed(() => decodeBasicAuthHeader(this.header()));

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected onUsernameInput(event: Event): void {
    this.username.set((event.target as HTMLInputElement).value);
  }

  protected onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected onHeaderInput(event: Event): void {
    this.header.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.username.set('');
    this.password.set('');
    this.header.set('');
  }
}
