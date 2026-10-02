import { secureRandomHex } from "@dude/tool-engine/tools/http-digest-auth-helper/http-digest-auth-helper.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  DigestAlgorithm,
  DigestComputeResult,
  DigestQop,
  computeDigestResponse,
  parseWwwAuthenticateChallenge,
} from "@dude/tool-engine/tools/http-digest-auth-helper/http-digest-auth-helper-logic";


@Component({
  selector: 'app-http-digest-auth-helper',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './http-digest-auth-helper.html',
})
export class HttpDigestAuthHelper {
  private readonly persistence = inject(PersistenceService);

  protected readonly challengeInput = signal('');
  protected readonly challenge = computed(() => (this.challengeInput().trim() === '' ? null : parseWwwAuthenticateChallenge(this.challengeInput())));

  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly method = this.persistence.signal('http-digest-auth-helper', 'method', 'local', 'GET');
  protected readonly uri = signal('');
  protected readonly realm = signal('');
  protected readonly nonce = signal('');
  protected readonly nc = this.persistence.signal('http-digest-auth-helper', 'nc', 'local', '00000001');
  protected readonly cnonce = signal(secureRandomHex(16));
  protected readonly qop = this.persistence.signal<DigestQop | 'none'>('http-digest-auth-helper', 'qop', 'local', 'auth');
  protected readonly algorithm = this.persistence.signal<DigestAlgorithm>('http-digest-auth-helper', 'algorithm', 'local', 'MD5');
  protected readonly opaque = signal('');

  protected readonly result = signal<{ readonly ok: true; readonly value: DigestComputeResult } | { readonly ok: false; readonly error: string } | null>(null);

  protected applyChallenge(): void {
    const parsed = this.challenge();
    if (!parsed || !parsed.ok) return;
    if (parsed.value.realm) this.realm.set(parsed.value.realm);
    if (parsed.value.nonce) this.nonce.set(parsed.value.nonce);
    if (parsed.value.opaque) this.opaque.set(parsed.value.opaque);
    if (parsed.value.algorithm) this.algorithm.set(parsed.value.algorithm as DigestAlgorithm);
    if (parsed.value.qop?.includes('auth-int')) this.qop.set('auth-int');
    else if (parsed.value.qop?.includes('auth')) this.qop.set('auth');
  }

  protected onChallengeInput(event: Event): void {
    this.challengeInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onUsernameInput(event: Event): void {
    this.username.set((event.target as HTMLInputElement).value);
  }

  protected onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected onMethodInput(event: Event): void {
    this.method.set((event.target as HTMLInputElement).value);
  }

  protected onUriInput(event: Event): void {
    this.uri.set((event.target as HTMLInputElement).value);
  }

  protected onRealmInput(event: Event): void {
    this.realm.set((event.target as HTMLInputElement).value);
  }

  protected onNonceInput(event: Event): void {
    this.nonce.set((event.target as HTMLInputElement).value);
  }

  protected onNcInput(event: Event): void {
    this.nc.set((event.target as HTMLInputElement).value);
  }

  protected onCnonceInput(event: Event): void {
    this.cnonce.set((event.target as HTMLInputElement).value);
  }

  protected onQopChange(event: Event): void {
    this.qop.set((event.target as HTMLSelectElement).value as DigestQop | 'none');
  }

  protected onAlgorithmChange(event: Event): void {
    this.algorithm.set((event.target as HTMLSelectElement).value as DigestAlgorithm);
  }

  protected regenerateCnonce(): void {
    this.cnonce.set(secureRandomHex(16));
  }

  protected compute(): void {
    const selectedQop = this.qop();
    const qop = selectedQop === 'none' ? undefined : selectedQop;
    computeDigestResponse({
      username: this.username(),
      password: this.password(),
      method: this.method(),
      uri: this.uri(),
      realm: this.realm(),
      nonce: this.nonce(),
      nc: qop ? this.nc() : undefined,
      cnonce: qop ? this.cnonce() : undefined,
      qop,
      algorithm: this.algorithm(),
      opaque: this.opaque() || undefined,
    }).then((result) => this.result.set(result));
  }
}
