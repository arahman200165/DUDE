import { Component, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { HMAC_HASH_ALGORITHMS, HmacHashAlgorithm, HmacKeyEncoding, HmacResult, computeHmac } from "@dude/tool-engine/tools/hmac-generator/hmac-generator-logic";

const KEY_ENCODINGS: readonly { readonly id: HmacKeyEncoding; readonly label: string }[] = [
  { id: 'utf8', label: 'UTF-8' },
  { id: 'hex', label: 'Hex' },
  { id: 'base64', label: 'Base64' },
];

/**
 * Deliberately does not persist the message or the key, even under a
 * `session` policy — HMAC key material is sensitive, and matching
 * JWT Signer's "input: none" convention keeps every input on this tool
 * (not just the key) as a bare in-memory signal for consistency. Only the
 * hash algorithm and key-encoding choices are non-sensitive UI preferences.
 */
@Component({
  selector: 'app-hmac-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './hmac-generator.html',
})
export class HmacGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly keyEncodings = KEY_ENCODINGS;
  protected readonly hashAlgorithms = HMAC_HASH_ALGORITHMS;

  protected readonly message = signal('');
  protected readonly key = signal('');
  protected readonly keyEncoding = this.persistence.signal<HmacKeyEncoding>('hmac-generator', 'keyEncoding', 'local', 'utf8');
  protected readonly hash = this.persistence.signal<HmacHashAlgorithm>('hmac-generator', 'hash', 'local', 'SHA-256');

  protected readonly status = signal<'idle' | 'computing'>('idle');
  protected readonly result = signal<HmacResult | null>(null);

  protected onMessageInput(event: Event): void {
    this.message.set((event.target as HTMLTextAreaElement).value);
  }

  protected onKeyInput(event: Event): void {
    this.key.set((event.target as HTMLInputElement).value);
  }

  protected setKeyEncoding(encoding: HmacKeyEncoding): void {
    this.keyEncoding.set(encoding);
  }

  protected setHash(hash: HmacHashAlgorithm): void {
    this.hash.set(hash);
  }

  protected async compute(): Promise<void> {
    this.status.set('computing');
    const result = await computeHmac(this.message(), this.key(), this.keyEncoding(), this.hash());
    this.result.set(result);
    this.status.set('idle');
  }

  protected clear(): void {
    this.message.set('');
    this.key.set('');
    this.result.set(null);
  }
}
