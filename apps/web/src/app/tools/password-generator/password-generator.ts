import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { generatePassphrase, generatePassword, passphraseEntropyBits, PasswordOptions, PassphraseOptions } from "@dude/tool-engine/tools/password-generator/password-generator-logic";

type Mode = 'password' | 'passphrase';

/**
 * Deliberately keeps generated output as a bare in-memory signal, not
 * persisted even under `session` — a generated password/passphrase is as
 * sensitive as a pasted one (see HMAC Generator's key field for the same
 * convention). Only the generation options are non-sensitive UI
 * preferences and use `PersistenceService` with `'local'`.
 */
@Component({
  selector: 'app-password-generator',
  imports: [ToolShell, ErrorPanel, CopyButton, DecimalPipe],
  templateUrl: './password-generator.html',
})
export class PasswordGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<Mode>('password-generator', 'mode', 'local', 'password');

  protected readonly length = this.persistence.signal('password-generator', 'length', 'local', 16);
  protected readonly useUppercase = this.persistence.signal('password-generator', 'useUppercase', 'local', true);
  protected readonly useLowercase = this.persistence.signal('password-generator', 'useLowercase', 'local', true);
  protected readonly useDigits = this.persistence.signal('password-generator', 'useDigits', 'local', true);
  protected readonly useSymbols = this.persistence.signal('password-generator', 'useSymbols', 'local', true);
  protected readonly excludeAmbiguous = this.persistence.signal('password-generator', 'excludeAmbiguous', 'local', false);

  protected readonly wordCount = this.persistence.signal('password-generator', 'wordCount', 'local', 6);
  protected readonly separator = this.persistence.signal('password-generator', 'separator', 'local', '-');
  protected readonly capitalize = this.persistence.signal('password-generator', 'capitalize', 'local', false);
  protected readonly includeDigit = this.persistence.signal('password-generator', 'includeDigit', 'local', true);

  protected readonly result = signal('');
  protected readonly error = signal('');

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.result.set('');
    this.error.set('');
  }

  protected passphraseEntropy(): number {
    return passphraseEntropyBits(this.wordCount());
  }

  protected onLengthInput(event: Event): void {
    this.length.set(Number((event.target as HTMLInputElement).value) || 1);
  }

  protected onWordCountInput(event: Event): void {
    this.wordCount.set(Number((event.target as HTMLInputElement).value) || 1);
  }

  protected onSeparatorInput(event: Event): void {
    this.separator.set((event.target as HTMLInputElement).value);
  }

  protected generate(): void {
    this.error.set('');
    try {
      if (this.mode() === 'password') {
        const opts: PasswordOptions = {
          length: this.length(),
          useUppercase: this.useUppercase(),
          useLowercase: this.useLowercase(),
          useDigits: this.useDigits(),
          useSymbols: this.useSymbols(),
          excludeAmbiguous: this.excludeAmbiguous(),
        };
        this.result.set(generatePassword(opts));
      } else {
        const opts: PassphraseOptions = {
          wordCount: this.wordCount(),
          separator: this.separator(),
          capitalize: this.capitalize(),
          includeDigit: this.includeDigit(),
        };
        this.result.set(generatePassphrase(opts));
      }
    } catch (err) {
      this.result.set('');
      this.error.set(err instanceof Error ? err.message : 'Could not generate a value.');
    }
  }
}
