import { JwtVerify_format } from "@dude/tool-engine/tools/jwt-verify/jwt-verify.embedded-engine";
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { ConnectivityService } from '../../core/connectivity/connectivity.service';
import { decodeJwt } from "@dude/tool-engine/tools/jwt/jwt-decode";
import { JwtVerifyMode, JwtVerifyResult, PublicKeyFormat, verifyJwt } from "@dude/tool-engine/tools/jwt-verify/jwt-verify-logic";
import { fetchJwksUriFromDiscovery, OIDC_PRESETS, type OidcPreset } from "@dude/tool-engine/tools/jwt-verify/jwt-oidc-presets";

const ALGORITHMS_BY_MODE: Record<JwtVerifyMode, readonly string[]> = {
  hmac: ['HS256', 'HS384', 'HS512'],
  'public-key': ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256', 'PS384', 'PS512'],
  jwks: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256', 'PS384', 'PS512'],
};

/**
 * Deliberately does NOT persist the token, secret, key material, or JWKS
 * URL — all sensitive/sensitive-adjacent (PRD Section 14.1/30), mirroring
 * the existing decode-only JWT Debugger's bare-signal approach. Only the
 * verification mode and public-key format are non-sensitive UI preferences.
 */
@Component({
  selector: 'app-jwt-verify',
  imports: [ToolShell, ErrorPanel],
  templateUrl: './jwt-verify.html',
})
export class JwtVerify {
  private readonly persistence = inject(PersistenceService);
  protected readonly connectivity = inject(ConnectivityService);

  protected readonly mode = this.persistence.signal<JwtVerifyMode>('jwt-verify', 'mode', 'local', 'hmac');
  protected readonly keyFormat = this.persistence.signal<PublicKeyFormat>('jwt-verify', 'keyFormat', 'local', 'pem');

  protected readonly token = signal('');
  protected readonly secret = signal('');
  protected readonly keyMaterial = signal('');
  protected readonly jwksUrl = signal('');
  protected readonly algorithm = signal('HS256');

  protected readonly algorithmsForMode = computed(() => ALGORITHMS_BY_MODE[this.mode()]);
  protected readonly decoded = computed(() => decodeJwt(this.token()));
  protected readonly keyMaterialPlaceholder = computed(() =>
    this.keyFormat() === 'pem' ? '-----BEGIN PUBLIC KEY-----…' : '{ "kty": "RSA", … }',
  );

  protected readonly status = signal<'idle' | 'checking' | 'done'>('idle');
  protected readonly result = signal<JwtVerifyResult | null>(null);

  protected readonly presetOptions = Object.entries(OIDC_PRESETS) as [OidcPreset, (typeof OIDC_PRESETS)[OidcPreset]][];
  protected readonly preset = this.persistence.signal<OidcPreset | 'none'>('jwt-verify', 'preset', 'local', 'none');
  protected readonly presetInput = this.persistence.signal('jwt-verify', 'presetInput', 'local', '');
  protected readonly presetConfig = computed(() => (this.preset() === 'none' ? null : OIDC_PRESETS[this.preset() as OidcPreset]));
  protected readonly presetStatus = signal<'idle' | 'loading'>('idle');
  protected readonly presetError = signal('');

  constructor() {
    // Re-seeds the algorithm field from the token's decoded header whenever it changes — still user-editable.
    effect(() => {
      const decoded = this.decoded();
      if (!decoded.ok) return;
      const alg = (decoded.header as { alg?: unknown } | null)?.alg;
      if (typeof alg === 'string' && this.algorithmsForMode().includes(alg)) this.algorithm.set(alg);
    });
  }

  protected setMode(mode: JwtVerifyMode): void {
    this.mode.set(mode);
    this.result.set(null);
    this.status.set('idle');
    if (!this.algorithmsForMode().includes(this.algorithm())) this.algorithm.set(this.algorithmsForMode()[0]);
  }

  protected setKeyFormat(format: PublicKeyFormat): void {
    this.keyFormat.set(format);
  }

  protected onTokenInput(event: Event): void {
    this.token.set((event.target as HTMLTextAreaElement).value);
  }

  protected onSecretInput(event: Event): void {
    this.secret.set((event.target as HTMLInputElement).value);
  }

  protected onKeyMaterialInput(event: Event): void {
    this.keyMaterial.set((event.target as HTMLTextAreaElement).value);
  }

  protected onJwksUrlInput(event: Event): void {
    this.jwksUrl.set((event.target as HTMLInputElement).value);
  }

  protected onPresetChange(event: Event): void {
    this.preset.set((event.target as HTMLSelectElement).value as OidcPreset | 'none');
    this.presetError.set('');
  }

  protected onPresetInputChange(event: Event): void {
    this.presetInput.set((event.target as HTMLInputElement).value);
  }

  protected async applyPreset(): Promise<void> {
    const config = this.presetConfig();
    if (!config) return;

    this.presetStatus.set('loading');
    this.presetError.set('');
    const result = await fetchJwksUriFromDiscovery(config.discoveryUrl(this.presetInput()));
    this.presetStatus.set('idle');

    if (!result.ok) {
      this.presetError.set(result.error);
      return;
    }
    this.jwksUrl.set(result.jwksUri);
  }

  protected onAlgorithmChange(event: Event): void {
    this.algorithm.set((event.target as HTMLSelectElement).value);
  }

  protected async verify(): Promise<void> {
    this.status.set('checking');
    const result = await verifyJwt({
      token: this.token(),
      mode: this.mode(),
      algorithm: this.algorithm(),
      secret: this.secret(),
      keyMaterial: this.keyMaterial(),
      keyFormat: this.keyFormat(),
      jwksUrl: this.jwksUrl(),
    });
    this.result.set(result);
    this.status.set('done');
  }

  protected clear(): void {
    this.token.set('');
    this.secret.set('');
    this.keyMaterial.set('');
    this.jwksUrl.set('');
    this.result.set(null);
    this.status.set('idle');
  }
  protected format = JwtVerify_format;

}
