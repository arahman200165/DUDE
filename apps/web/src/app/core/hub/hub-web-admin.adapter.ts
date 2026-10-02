import type {
  AuditListResponse, BootstrapRequest, BootstrapResponse, ConfirmPreview, CurrentSessionResponse, DeviceInfo, DeviceListResponse, OkResponse,
  OwnerResetResponse, PairingCodeResponse, RecoveryCodesResponse, SessionListResponse, SignInResponse,
} from '@dude/contracts/hub';
import type { HubClient } from '@dude/api-client';
import { HUB_ADMIN_UNAVAILABLE, HubAdminError, HubAdminPort, HubEnrollment, HubOwnerStatus, HubProbe, HubStatus } from './hub-admin.port';
import { createFetchHubTransport } from './fetch-hub-transport';

type ApiClientModule = typeof import('@dude/api-client');

export interface HubWebAdminOptions {
  /** Loads `@dude/api-client`; lazy so builds that never administer a Hub do not carry it. */
  readonly loadApiClient: () => Promise<ApiClientModule>;
  readonly fetch?: typeof fetch;
  readonly origin?: () => string | null;
}

const unavailable = (what: string): Promise<never> => Promise.reject(new HubAdminError(HUB_ADMIN_UNAVAILABLE, `${what} is only available in the desktop app.`));

/**
 * Hub-web adapter: `createHubClient` over a same-origin fetch transport, cookie session, `X-DUDE-CSRF` taken from
 * sign-in / current-session and kept in memory only. All calls go through the shared client; this adapter is
 * the mapping plus CSRF bookkeeping.
 */
export function createHubWebAdmin(options: HubWebAdminOptions): HubAdminPort {
  let csrfToken: string | undefined;
  const transport = createFetchHubTransport({ fetch: options.fetch, csrfToken: () => csrfToken });
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

  async function viaClient<T>(call: (client: HubClient) => Promise<T>): Promise<T> {
    const { module, client } = await load();
    try {
      return await call(client);
    } catch (error) {
      throw await normalize(error, module);
    }
  }

  const remember = (session: SignInResponse): SignInResponse => {
    csrfToken = session.csrfToken;
    return session;
  };
  const toOwner = (session: CurrentSessionResponse): HubOwnerStatus => ({ signedIn: true, ownerDisplayName: session.owner.displayName, expiresAt: session.session.absoluteExpiresAt });

  const signIn = async (password: string): Promise<SignInResponse> => remember(await viaClient((c) => c.signIn(password)));
  const currentSession = async (): Promise<CurrentSessionResponse> => remember(await viaClient((c) => c.currentSession()));
  const signOut = async (): Promise<OkResponse> => {
    try {
      return await viaClient((c) => c.signOut());
    } finally {
      csrfToken = undefined;
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
    recoveryCodesPreview: (): Promise<ConfirmPreview> => viaClient((c) => c.recoveryCodesPreview(undefined)),
    regenerateRecoveryCodes: (token): Promise<RecoveryCodesResponse> => viaClient((c) => c.regenerateRecoveryCodes(undefined, token)),
    changePassword: (current, next): Promise<OkResponse> => viaClient((c) => c.changePassword(undefined, current, next)),

    bootstrap: (request: BootstrapRequest): Promise<BootstrapResponse> => viaClient((c) => c.bootstrap(request)),
    signIn,
    currentSession,
    signOut,
    recover: async (recoveryCode, newPassword) => remember(await viaClient((c) => c.recover(recoveryCode, newPassword))),
    ownerReset: (resetToken, newPassword): Promise<OwnerResetResponse> => viaClient((c) => c.ownerReset(resetToken, newPassword)),
  };
}
