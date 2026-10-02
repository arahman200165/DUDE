import { Component, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { AesMode, decryptAes, DEFAULT_PBKDF2_ITERATIONS, encryptAes } from "@dude/tool-engine/tools/aes-encrypt-decrypt/aes-cipher";

type OpMode = 'encrypt' | 'decrypt';

/**
 * Deliberately does not persist the passphrase or plaintext/ciphertext —
 * both are sensitive, mirroring `jwt-signer`'s bare-signal approach. Only
 * the cipher mode and iteration count (non-sensitive UI preferences)
 * persist locally. Encryption/decryption is pure Web Crypto — no network.
 */
@Component({
  selector: 'app-aes-encrypt-decrypt',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './aes-encrypt-decrypt.html',
})
export class AesEncryptDecrypt {
  private readonly persistence = inject(PersistenceService);

  protected readonly opMode = signal<OpMode>('encrypt');
  protected readonly cipherMode = this.persistence.signal<AesMode>('aes-encrypt-decrypt', 'cipherMode', 'local', 'AES-GCM');
  protected readonly iterations = this.persistence.signal<number>(
    'aes-encrypt-decrypt',
    'iterations',
    'local',
    DEFAULT_PBKDF2_ITERATIONS,
  );
  protected readonly showPassphrase = this.persistence.signal<boolean>(
    'aes-encrypt-decrypt',
    'showPassphrase',
    'local',
    false,
  );

  protected readonly passphrase = signal('');
  protected readonly plaintext = signal('');
  protected readonly ciphertextBundle = signal('');

  protected readonly status = signal<'idle' | 'busy'>('idle');
  protected readonly error = signal<string | null>(null);

  protected setOpMode(mode: OpMode): void {
    this.opMode.set(mode);
    this.error.set(null);
  }

  protected setCipherMode(mode: AesMode): void {
    this.cipherMode.set(mode);
  }

  protected onPassphraseInput(event: Event): void {
    this.passphrase.set((event.target as HTMLInputElement).value);
  }

  protected onPlaintextInput(event: Event): void {
    this.plaintext.set((event.target as HTMLTextAreaElement).value);
  }

  protected onCiphertextInput(event: Event): void {
    this.ciphertextBundle.set((event.target as HTMLTextAreaElement).value);
  }

  protected onIterationsInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value > 0) this.iterations.set(Math.floor(value));
  }

  protected toggleShowPassphrase(): void {
    this.showPassphrase.update((v) => !v);
  }

  protected async run(): Promise<void> {
    this.status.set('busy');
    this.error.set(null);
    try {
      if (this.opMode() === 'encrypt') {
        const { bundle } = await encryptAes(this.plaintext(), this.passphrase(), this.cipherMode(), this.iterations());
        this.ciphertextBundle.set(bundle);
      } else {
        const result = await decryptAes(this.ciphertextBundle(), this.passphrase());
        if (result.ok) {
          this.plaintext.set(result.plaintext);
        } else {
          this.error.set(result.error);
        }
      }
    } finally {
      this.status.set('idle');
    }
  }

  protected clear(): void {
    this.passphrase.set('');
    this.plaintext.set('');
    this.ciphertextBundle.set('');
    this.error.set(null);
  }
}
