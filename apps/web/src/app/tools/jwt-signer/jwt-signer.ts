import { JwtSigner_format } from "@dude/tool-engine/tools/jwt-signer/jwt-signer.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { decodeJwt } from "@dude/tool-engine/tools/jwt/jwt-decode";
import {
  generateSigningKeyPair,
  GeneratedKeyPair,
  JwtSignMode,
  JwtSignResult,
  PrivateKeyFormat,
  signJwt,
} from "@dude/tool-engine/tools/jwt-signer/jwt-signer-logic";

const ALGORITHMS_BY_MODE: Record<JwtSignMode, readonly string[]> = {
  hmac: ['HS256', 'HS384', 'HS512'],
  'private-key': ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256', 'PS384', 'PS512'],
};

const DEFAULT_CLAIMS = JSON.stringify({ sub: 'user-id', iat: Math.floor(Date.now() / 1000) }, null, 2);

/**
 * Deliberately does not persist claims, secret, key material, or the
 * generated key pair/token — all sensitive/sensitive-adjacent, mirroring
 * JWT Verify's bare-signal approach. Only mode/keyFormat/algorithm are
 * non-sensitive UI preferences. Signing and key generation are pure Web
 * Crypto via `jose` — this tool never makes a network request.
 */
@Component({
  selector: 'app-jwt-signer',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './jwt-signer.html',
})
export class JwtSigner {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<JwtSignMode>('jwt-signer', 'mode', 'local', 'hmac');
  protected readonly keyFormat = this.persistence.signal<PrivateKeyFormat>('jwt-signer', 'keyFormat', 'local', 'pem');
  protected readonly algorithm = signal('HS256');

  protected readonly claimsJson = signal(DEFAULT_CLAIMS);
  protected readonly secret = signal('');
  protected readonly keyMaterial = signal('');

  protected readonly generatedKeyPair = signal<GeneratedKeyPair | null>(null);
  protected readonly generateStatus = signal<'idle' | 'generating'>('idle');

  protected readonly status = signal<'idle' | 'signing' | 'done'>('idle');
  protected readonly result = signal<JwtSignResult | null>(null);

  protected readonly algorithmsForMode = computed(() => ALGORITHMS_BY_MODE[this.mode()]);
  protected readonly signedPreview = computed(() => {
    const current = this.result();
    return current?.ok ? decodeJwt(current.token) : null;
  });

  protected setMode(mode: JwtSignMode): void {
    this.mode.set(mode);
    this.result.set(null);
    this.status.set('idle');
    if (!this.algorithmsForMode().includes(this.algorithm())) this.algorithm.set(this.algorithmsForMode()[0]);
  }

  protected setKeyFormat(format: PrivateKeyFormat): void {
    this.keyFormat.set(format);
  }

  protected onClaimsInput(event: Event): void {
    this.claimsJson.set((event.target as HTMLTextAreaElement).value);
  }

  protected onSecretInput(event: Event): void {
    this.secret.set((event.target as HTMLInputElement).value);
  }

  protected onKeyMaterialInput(event: Event): void {
    this.keyMaterial.set((event.target as HTMLTextAreaElement).value);
  }

  protected onAlgorithmChange(event: Event): void {
    this.algorithm.set((event.target as HTMLSelectElement).value);
  }

  protected async generateKeyPair(): Promise<void> {
    this.generateStatus.set('generating');
    try {
      const pair = await generateSigningKeyPair(this.algorithm());
      this.generatedKeyPair.set(pair);
      this.keyFormat.set('pem');
      this.keyMaterial.set(pair.privateKeyPem);
    } finally {
      this.generateStatus.set('idle');
    }
  }

  protected async sign(): Promise<void> {
    this.status.set('signing');
    const result = await signJwt({
      claimsJson: this.claimsJson(),
      mode: this.mode(),
      algorithm: this.algorithm(),
      secret: this.secret(),
      keyMaterial: this.keyMaterial(),
      keyFormat: this.keyFormat(),
    });
    this.result.set(result);
    this.status.set('done');
  }

  protected clear(): void {
    this.claimsJson.set(DEFAULT_CLAIMS);
    this.secret.set('');
    this.keyMaterial.set('');
    this.generatedKeyPair.set(null);
    this.result.set(null);
    this.status.set('idle');
  }
  protected format = JwtSigner_format;

}
