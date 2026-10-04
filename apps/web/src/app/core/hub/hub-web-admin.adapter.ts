import type {
  AuditListResponse, SecurityAlertsResponse, BootstrapRequest, BootstrapResponse, ConfirmPreview, CurrentSessionResponse, DeviceInfo, DeviceListResponse, OkResponse, SyncSummary, HubDiagnosticsReport, ReachabilityEchoResponse, TlsCertificatesResponse,
  OwnerResetResponse, PairingCodeResponse, RecoveryCodesResponse, SessionListResponse, SignInResponse,
} from '@dude/contracts/hub';
import type { HubClient } from '@dude/api-client';
import { HUB_ADMIN_UNAVAILABLE, HubAdminError, HubAdminPort, HubEnrollment, HubOwnerStatus, HubProbe, HubStatus } from './hub-admin.port';
import { createFetchHubTransport } from './fetch-hub-transport';
import { hubCsrf } from './hub-csrf';

type ApiClientModule = typeof import('@dude/api-client');

export interface HubWebAdminOptions {
  /** Loads `@dude/api-client`; lazy so builds that never administer a Hub do not carry it. */
  readonly loadApiClient: () => Promise<ApiClientModule>;
  readonly fetch?: typeof fetch;
  readonly origin?: () => string | null;
  /** Asks the owner for the password when a guarded call needs step-up; resolves null when cancelled. */
  readonly requestStepUp?: (message?: string) => Promise<string | null>;
}

const unavailable = (what: string): Promise<never> => Promise.reject(new HubAdminError(HUB_ADMIN_UNAVAILABLE, `${what} is only available in the desktop app.`));

/**
 * Hub-web adapter: `createHubClient` over a same-origin fetch transport, cookie session, `X-DUDE-CSRF` taken from
 * sign-in / current-session and kept in memory only. All calls go through the shared client; this adapter is
 * the mapping plus CSRF bookkeeping.
 */
export function createHubWebAdmin(options: HubWebAdminOptions): HubAdminPort {
  const transport = createFetchHubTransport({ fetch: options.fetch, csrfToken: () => hubCsrf.get() });
  let clientPromise: Promise<{ readonly module: ApiClientModule; readonly client: HubClient }> | undefined;
  const origin = options.origin ?? (() => globalThis.location?.origin ?? null);

  const load = (): Promise<{ readonly module: ApiClientModule; readonly client: HubClient }> =>
    (clientPromise ??= options.loadApiClient().then((module) => ({ module, client: module.createHubClient(transport, { clientProtocol: 1, minHubProtocol: 1 }) })));

  async function normalize(error: unknown, module?: ApiClientModule): Promise<HubAdminError> {
    if (error instanceof HubAdminError) return error;
    const mod = module ?? (await load()).module;
    if (error instanceof mod.HubApiError) return new HubAdminError(error.code, error.message, transport.lastRetryAfterMs() ?? undefined);
    if (error instanceof mod.HubProtocolError) return new HubAdminError('protocol', error.message);
    return new HubAdminError('network', error instanceof Error ? error.message : 'The Hub could not be reached.');
  }

  const isCode = (error: unknown, module: ApiClientModule, code: string): boolean => error instanceof module.HubApiError && error.code === code;
  const MAX_STEP_UP_ATTEMPTS = 3;

  /** Confirms the password (re-asking after a wrong one), adopting the rotated CSRF token. Throws when it cannot. */
  async function stepUp(module: ApiClientModule, client: HubClient, ask: (message?: string) => Promise<string | null>): Promise<void> {
    let message: string | undefined;
    for (let attempt = 0; attempt < MAX_STEP_UP_ATTEMPTS; attempt++) {
      const password = await ask(message);
      if (password === null) throw new HubAdminError('step-up-required', 'Password confirmation was cancelled.');
      try {
        const response = await client.stepUp(undefined, password);
        hubCsrf.set(response.csrfToken ?? undefined);
        return;
      } catch (error) {
        if (!isCode(error, module, 'forbidden')) throw await normalize(error, module);
        message = (error as Error).message;
      }
    }
    throw new HubAdminError('forbidden', message ?? 'The password is incorrect.');
  }

  async function viaClient<T>(call: (client: HubClient) => Promise<T>): Promise<T> {
    const { module, client } = await load();
    try {
      return await call(client);
    } catch (error) {
      if (options.requestStepUp && isCode(error, module, 'step-up-required')) {
        await stepUp(module, client, options.requestStepUp);
        try {
          return await call(client);
        } catch (retryError) {
          throw await normalize(retryError, module);
        }
      }
      throw await normalize(error, module);
    }
  }

  const remember = (session: SignInResponse): SignInResponse => {
    hubCsrf.set(session.csrfToken);
    return session;
  };
  const toOwner = (session: CurrentSessionResponse): HubOwnerStatus => ({ signedIn: true, ownerDisplayName: session.owner.displayName, expiresAt: session.session.absoluteExpiresAt });

  const signIn = async (password: string): Promise<SignInResponse> => remember(await viaClient((c) => c.signIn(password)));
  const currentSession = async (): Promise<CurrentSessionResponse> => remember(await viaClient((c) => c.currentSession()));
  const signOut = async (): Promise<OkResponse> => {
    try {
      return await viaClient((c) => c.signOut());
    } finally {
      hubCsrf.clear();
    }
  };

  return {
    status: () =>
      viaClient(async (client): Promise<HubStatus> => {
        const hello = await client.hello();
        return { enrollmentState: 'enrolled', hubUrl: origin(), environmentId: hello.environmentId, hubInstanceId: hello.hubInstanceId, hubVersion: hello.hubVersion, reachable: true };
      }),
    tlsFingerprint: () => viaClient(async (client) => (await client.hello()).tls),
    probeLocal: () =>
      viaClient(async (client): Promise<HubProbe> => {
        const hello = await client.hello();
        const port = Number(globalThis.location?.port);
        return { found: true, port: Number.isInteger(port) && port > 0 ? port : null, hubInstanceId: hello.hubInstanceId, hubVersion: hello.hubVersion, bootstrapped: hello.bootstrapped };
      }),
    enroll: (): Promise<HubEnrollment> => unavailable('Enrolling this device'),
    reconnect: (): Promise<HubEnrollment> => unavailable('Reconnecting this device'),
    unenroll: () => unavailable('Unenrolling this device'),
    ownerStatus: async (): Promise<HubOwnerStatus> => {
      try {
        return toOwner(await currentSession());
      } catch (error) {
        if (error instanceof HubAdminError && error.code === 'unauthorized') return { signedIn: false, ownerDisplayName: null, expiresAt: null };
        throw error;
      }
    },
    ownerSignIn: async (password) => toOwner(await signIn(password)),
    ownerSignOut: signOut,
    listDevices: (): Promise<DeviceListResponse> => viaClient((c) => c.listDevices(undefined)),
    syncSummary: (): Promise<SyncSummary> => viaClient((c) => c.syncSummary(undefined)),
    diagnostics: (): Promise<HubDiagnosticsReport> => viaClient((c) => c.diagnostics(undefined)),
    reachabilityEcho: (): Promise<ReachabilityEchoResponse> => viaClient((c) => c.reachabilityEcho(undefined)),
    tlsCertificates: (): Promise<TlsCertificatesResponse> => viaClient((c) => c.tlsCertificates()),
    serverDate: async (): Promise<string | null> => {
      try {
        return (await transport.request({ method: 'GET', path: '/api/v1/hello' })).headers['date'] ?? null;
      } catch (error) {
        throw await normalize(error);
      }
    },
    createPairingCode: (host): Promise<PairingCodeResponse> => viaClient((c) => c.createPairingCode(undefined, host === undefined ? undefined : { host })),
    renameDevice: (id, name): Promise<DeviceInfo> => viaClient((c) => c.renameDevice(undefined, id, name)),
    revokeDevicePreview: (id): Promise<ConfirmPreview> => viaClient((c) => c.revokeDevicePreview(undefined, id)),
    revokeDevice: (id, token): Promise<OkResponse> => viaClient((c) => c.revokeDevice(undefined, id, token)),
    setRecoveryTrust: (id, password, trusted) => viaClient((c) => c.setRecoveryTrust(undefined, id, password, trusted)),
    listSessions: (): Promise<SessionListResponse> => viaClient((c) => c.listSessions(undefined)),
    revokeSession: (id): Promise<OkResponse> => viaClient((c) => c.revokeSession(undefined, id)),
    revokeAllPreview: (): Promise<ConfirmPreview> => viaClient((c) => c.revokeAllPreview(undefined)),
    revokeAll: (token): Promise<OkResponse> => viaClient((c) => c.revokeAll(undefined, token)),
    listAudit: (beforeSeq): Promise<AuditListResponse> => viaClient((c) => c.listAudit(undefined, beforeSeq === undefined ? undefined : { beforeSeq })),
    listSecurityAlerts: (): Promise<SecurityAlertsResponse> => viaClient((c) => c.listSecurityAlerts(undefined)),
    markSecurityAlertsSeen: (upToSeq): Promise<OkResponse> => viaClient((c) => c.markSecurityAlertsSeen(undefined, upToSeq)),
    recoveryCodesPreview: (): Promise<ConfirmPreview> => viaClient((c) => c.recoveryCodesPreview(undefined)),
    regenerateRecoveryCodes: (token): Promise<RecoveryCodesResponse> => viaClient((c) => c.regenerateRecoveryCodes(undefined, token)),
    changePassword: async (current, next): Promise<OkResponse> => {
      const response = await viaClient((c) => c.changePassword(undefined, current, next));
      if (response.csrfToken !== null) hubCsrf.set(response.csrfToken);
      return response;
    },

    bootstrap: (request: BootstrapRequest): Promise<BootstrapResponse> => viaClient((c) => c.bootstrap(request)),
    signIn,
    currentSession,
    signOut,
    recover: async (recoveryCode, newPassword) => remember(await viaClient((c) => c.recover(recoveryCode, newPassword))),
    ownerReset: (resetToken, newPassword): Promise<OwnerResetResponse> => viaClient((c) => c.ownerReset(resetToken, newPassword)),
  };
}
