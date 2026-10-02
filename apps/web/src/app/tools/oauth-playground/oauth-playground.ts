import { OAuthPlayground_format } from "@dude/tool-engine/tools/oauth-playground/oauth-playground.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  GrantType,
  buildAuthorizationCodeRequest,
  buildDeviceAuthorizationRequest,
  buildImplicitRequest,
  buildTokenRequestBody,
  computePkceChallenge,
  generatePkceVerifier,
  inspectAuthorizationCallback,
  inspectDeviceAuthorizationResponse,
  inspectTokenResponse,
} from "@dude/tool-engine/tools/oauth-playground/oauth-playground-logic";

type SubMode = 'build' | 'inspect';

const GRANT_LABELS: Record<GrantType, string> = {
  authorization_code: 'Authorization Code',
  pkce: 'PKCE',
  client_credentials: 'Client Credentials',
  password: 'Password',
  device_code: 'Device Authorization',
  implicit: 'Implicit (legacy)',
  refresh_token: 'Refresh Token',
};

@Component({
  selector: 'app-oauth-playground',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './oauth-playground.html',
})
export class OAuthPlayground {
  private readonly persistence = inject(PersistenceService);

  protected readonly grantTypes = Object.keys(GRANT_LABELS) as GrantType[];
  protected readonly grantLabels = GRANT_LABELS;

  protected readonly grantType = this.persistence.signal<GrantType>('oauth-playground', 'grantType', 'local', 'authorization_code');
  protected readonly subMode = this.persistence.signal<SubMode>('oauth-playground', 'subMode', 'local', 'build');

  protected readonly authorizationEndpoint = signal('');
  protected readonly tokenEndpoint = signal('');
  protected readonly deviceAuthorizationEndpoint = signal('');
  protected readonly clientId = signal('');
  protected readonly clientSecret = signal('');
  protected readonly redirectUri = signal('');
  protected readonly scope = signal('');
  protected readonly state = signal('');
  protected readonly code = signal('');
  protected readonly codeVerifier = signal('');
  protected readonly codeChallenge = signal('');
  protected readonly username = signal('');
  protected readonly password = signal('');
  protected readonly refreshToken = signal('');

  protected readonly callbackUrl = signal('');
  protected readonly deviceResponseJson = signal('');
  protected readonly tokenResponseJson = signal('');

  protected readonly usesAuthorizationStep = computed(() => ['authorization_code', 'pkce', 'implicit'].includes(this.grantType()));
  protected readonly usesTokenStep = computed(() => ['authorization_code', 'pkce', 'client_credentials', 'password', 'refresh_token'].includes(this.grantType()));
  protected readonly usesDeviceStep = computed(() => this.grantType() === 'device_code');
  protected readonly usesPkce = computed(() => this.grantType() === 'pkce');
  protected readonly isImplicit = computed(() => this.grantType() === 'implicit');

  protected readonly authRequestResult = computed(() => {
    if (!this.usesAuthorizationStep()) return null;
    const params = {
      authorizationEndpoint: this.authorizationEndpoint(),
      clientId: this.clientId(),
      redirectUri: this.redirectUri(),
      scope: this.scope() || undefined,
      state: this.state() || undefined,
      codeChallenge: this.usesPkce() ? this.codeChallenge() || undefined : undefined,
    };
    return this.isImplicit() ? buildImplicitRequest(params) : buildAuthorizationCodeRequest(params);
  });

  protected readonly tokenRequestResult = computed(() => {
    if (!this.usesTokenStep()) return null;
    const grantType = this.grantType() === 'pkce' ? 'authorization_code' : (this.grantType() as 'authorization_code' | 'client_credentials' | 'password' | 'refresh_token');
    return buildTokenRequestBody({
      grantType,
      tokenEndpoint: this.tokenEndpoint(),
      clientId: this.clientId(),
      clientSecret: this.clientSecret() || undefined,
      scope: this.scope() || undefined,
      code: this.code() || undefined,
      redirectUri: this.redirectUri() || undefined,
      codeVerifier: this.usesPkce() ? this.codeVerifier() || undefined : undefined,
      username: this.username() || undefined,
      password: this.password() || undefined,
      refreshToken: this.refreshToken() || undefined,
    });
  });

  protected readonly deviceRequestResult = computed(() => {
    if (!this.usesDeviceStep()) return null;
    return buildDeviceAuthorizationRequest({
      deviceAuthorizationEndpoint: this.deviceAuthorizationEndpoint(),
      clientId: this.clientId(),
      scope: this.scope() || undefined,
    });
  });

  protected readonly callbackInspection = computed(() =>
    this.usesAuthorizationStep() && this.callbackUrl() !== '' ? inspectAuthorizationCallback(this.callbackUrl()) : null,
  );

  protected readonly deviceResponseInspection = computed(() =>
    this.usesDeviceStep() && this.deviceResponseJson() !== '' ? inspectDeviceAuthorizationResponse(this.deviceResponseJson()) : null,
  );

  protected readonly tokenResponseInspection = computed(() =>
    this.tokenResponseJson() !== '' ? inspectTokenResponse(this.tokenResponseJson()) : null,
  );

  protected setGrantType(grantType: GrantType): void {
    this.grantType.set(grantType);
  }

  protected setSubMode(mode: SubMode): void {
    this.subMode.set(mode);
  }

  protected async generatePkcePair(): Promise<void> {
    const verifier = generatePkceVerifier(64);
    this.codeVerifier.set(verifier);
    this.codeChallenge.set(await computePkceChallenge(verifier));
  }

  protected onAuthorizationEndpointInput(event: Event): void {
    this.authorizationEndpoint.set((event.target as HTMLInputElement).value);
  }

  protected onTokenEndpointInput(event: Event): void {
    this.tokenEndpoint.set((event.target as HTMLInputElement).value);
  }

  protected onDeviceAuthorizationEndpointInput(event: Event): void {
    this.deviceAuthorizationEndpoint.set((event.target as HTMLInputElement).value);
  }

  protected onClientIdInput(event: Event): void {
    this.clientId.set((event.target as HTMLInputElement).value);
  }

  protected onClientSecretInput(event: Event): void {
    this.clientSecret.set((event.target as HTMLInputElement).value);
  }

  protected onRedirectUriInput(event: Event): void {
    this.redirectUri.set((event.target as HTMLInputElement).value);
  }

  protected onScopeInput(event: Event): void {
    this.scope.set((event.target as HTMLInputElement).value);
  }

  protected onStateInput(event: Event): void {
    this.state.set((event.target as HTMLInputElement).value);
  }

  protected onCodeInput(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  protected onCodeVerifierInput(event: Event): void {
    this.codeVerifier.set((event.target as HTMLInputElement).value);
  }

  protected onUsernameInput(event: Event): void {
    this.username.set((event.target as HTMLInputElement).value);
  }

  protected onPasswordInput(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected onRefreshTokenInput(event: Event): void {
    this.refreshToken.set((event.target as HTMLInputElement).value);
  }

  protected onCallbackUrlInput(event: Event): void {
    this.callbackUrl.set((event.target as HTMLTextAreaElement).value);
  }

  protected onDeviceResponseJsonInput(event: Event): void {
    this.deviceResponseJson.set((event.target as HTMLTextAreaElement).value);
  }

  protected onTokenResponseJsonInput(event: Event): void {
    this.tokenResponseJson.set((event.target as HTMLTextAreaElement).value);
  }
  protected format = OAuthPlayground_format;

}
