import { Value } from 'typebox/value';
import type { TSchema, Static } from 'typebox';
import {
  HUB_API_PREFIX, HelloResponse, ErrorEnvelope, checkProtocolCompatibility,
  BootstrapResponse, TlsCertificatesResponse, AuditListResponse,
  EnrollResponse, DeviceChallengeResponse, DeviceTokenResponse, DeviceInfo, DeviceListResponse, OwnerBearerResponse, PairingCodeResponse,
  OkResponse, ConfirmPreview, SessionListResponse, RecoveryCodesResponse,
  SignInResponse, CurrentSessionResponse, OwnerResetResponse,
} from '@dude/contracts/hub';
import type {
  ProtocolCompatibility, BootstrapRequest, EnrollRequest, DeviceSelfUpdate, PairingCodeRequest,
} from '@dude/contracts/hub';
import type { HubRequest, HubTransport } from './transport.js';
import { HubApiError, HubProtocolError } from './errors.js';

export interface HubClientOptions {
  clientProtocol: number;
  minHubProtocol: number;
}

/** A bearer token (device `ddt_` or owner `dob_`), sent as the Authorization header. */
export type Bearer = string | undefined;

export interface HubClient {
  hello(): Promise<HelloResponse>;
  compatibility(hello: Pick<HelloResponse, 'protocolVersion' | 'minClientProtocol'>): ProtocolCompatibility;
  bootstrap(body: BootstrapRequest): Promise<BootstrapResponse>;
  tlsCertificates(): Promise<TlsCertificatesResponse>;

  // Browser cookie session. The browser stores the cookie and the transport adds `X-DUDE-CSRF`; the client handles neither.
  signIn(password: string): Promise<SignInResponse>;
  currentSession(): Promise<CurrentSessionResponse>;
  recover(recoveryCode: string, newPassword: string): Promise<SignInResponse>;
  ownerReset(resetToken: string, newPassword: string): Promise<OwnerResetResponse>;

  // Device (no credential, or a device token as `auth`).
  enroll(body: EnrollRequest): Promise<EnrollResponse>;
  deviceChallenge(deviceId: string): Promise<DeviceChallengeResponse>;
  deviceToken(body: { deviceId: string; nonce: string; signature: string }): Promise<DeviceTokenResponse>;
  deviceSelf(auth: Bearer): Promise<DeviceInfo>;
  updateDeviceSelf(auth: Bearer, body: DeviceSelfUpdate): Promise<DeviceInfo>;
  unenrollSelf(auth: Bearer): Promise<OkResponse>;
  /** Device token required: exchanges the owner password for an owner bearer session. */
  ownerBearer(auth: Bearer, password: string): Promise<OwnerBearerResponse>;

  // Owner (owner bearer as `auth`).
  /** Ends the current session: cookie (omit `auth`) or owner bearer. */
  signOut(auth?: Bearer): Promise<OkResponse>;
  listDevices(auth: Bearer): Promise<DeviceListResponse>;
  createPairingCode(auth: Bearer, body?: PairingCodeRequest): Promise<PairingCodeResponse>;
  renameDevice(auth: Bearer, deviceId: string, displayName: string): Promise<DeviceInfo>;
  revokeDevicePreview(auth: Bearer, deviceId: string): Promise<ConfirmPreview>;
  revokeDevice(auth: Bearer, deviceId: string, confirmToken: string): Promise<OkResponse>;
  setRecoveryTrust(auth: Bearer, deviceId: string, password: string, trusted: boolean): Promise<DeviceInfo>;
  listSessions(auth: Bearer): Promise<SessionListResponse>;
  revokeSession(auth: Bearer, sessionId: string): Promise<OkResponse>;
  revokeAllPreview(auth: Bearer): Promise<ConfirmPreview>;
  revokeAll(auth: Bearer, confirmToken: string): Promise<OkResponse>;
  listAudit(auth: Bearer, query?: { beforeSeq?: number; limit?: number }): Promise<AuditListResponse>;
  recoveryCodesPreview(auth: Bearer): Promise<ConfirmPreview>;
  regenerateRecoveryCodes(auth: Bearer, confirmToken: string): Promise<RecoveryCodesResponse>;
  changePassword(auth: Bearer, currentPassword: string, newPassword: string): Promise<OkResponse>;
}

const P = HUB_API_PREFIX;

export function createHubClient(transport: HubTransport, opts: HubClientOptions): HubClient {
  /** Sends a request, maps non-2xx ErrorEnvelopes to HubApiError and validates success bodies against the schema. */
  async function call<S extends TSchema>(schema: S, req: HubRequest, auth?: string): Promise<Static<S>> {
    const full: HubRequest = auth === undefined ? req : { ...req, headers: { ...req.headers, authorization: `Bearer ${auth}` } };
    const res = await transport.request(full);
    if (res.status < 200 || res.status >= 300) {
      if (Value.Check(ErrorEnvelope, res.body)) throw new HubApiError(res.status, res.body.error.code, res.body.error.message);
      throw new HubProtocolError(`Hub returned HTTP ${res.status} without a valid error envelope`, res.status);
    }
    if (!Value.Check(schema, res.body)) throw new HubProtocolError(`Hub response for ${req.method} ${req.path} failed schema validation`, res.status);
    return res.body as Static<S>;
  }
  const seg = encodeURIComponent;

  return {
    hello: () => call(HelloResponse, { method: 'GET', path: `${P}/hello` }),
    compatibility: (hello) => checkProtocolCompatibility(hello, { protocolVersion: opts.clientProtocol, minHubProtocol: opts.minHubProtocol }),
    bootstrap: (body) => call(BootstrapResponse, { method: 'POST', path: `${P}/bootstrap`, body }),
    tlsCertificates: () => call(TlsCertificatesResponse, { method: 'GET', path: `${P}/tls/certificates` }),

    signIn: (password) => call(SignInResponse, { method: 'POST', path: `${P}/auth/sign-in`, body: { password } }),
    currentSession: () => call(CurrentSessionResponse, { method: 'GET', path: `${P}/auth/session` }),
    recover: (recoveryCode, newPassword) => call(SignInResponse, { method: 'POST', path: `${P}/auth/recover`, body: { recoveryCode, newPassword } }),
    ownerReset: (resetToken, newPassword) => call(OwnerResetResponse, { method: 'POST', path: `${P}/owner/reset`, body: { resetToken, newPassword } }),

    enroll: (body) => call(EnrollResponse, { method: 'POST', path: `${P}/devices/enroll`, body }),
    deviceChallenge: (deviceId) => call(DeviceChallengeResponse, { method: 'POST', path: `${P}/auth/device/challenge`, body: { deviceId } }),
    deviceToken: (body) => call(DeviceTokenResponse, { method: 'POST', path: `${P}/auth/device/token`, body }),
    deviceSelf: (auth) => call(DeviceInfo, { method: 'GET', path: `${P}/devices/self` }, auth),
    updateDeviceSelf: (auth, body) => call(DeviceInfo, { method: 'PATCH', path: `${P}/devices/self`, body }, auth),
    unenrollSelf: (auth) => call(OkResponse, { method: 'POST', path: `${P}/devices/self/unenroll` }, auth),
    ownerBearer: (auth, password) => call(OwnerBearerResponse, { method: 'POST', path: `${P}/auth/owner/bearer`, body: { password } }, auth),

    signOut: (auth) => call(OkResponse, { method: 'POST', path: `${P}/auth/sign-out` }, auth),
    listDevices: (auth) => call(DeviceListResponse, { method: 'GET', path: `${P}/devices` }, auth),
    createPairingCode: (auth, body) => call(PairingCodeResponse, { method: 'POST', path: `${P}/pairing-codes`, body: body ?? {} }, auth),
    renameDevice: (auth, id, displayName) => call(DeviceInfo, { method: 'PATCH', path: `${P}/devices/${seg(id)}`, body: { displayName } }, auth),
    revokeDevicePreview: (auth, id) => call(ConfirmPreview, { method: 'POST', path: `${P}/devices/${seg(id)}/revoke/preview` }, auth),
    revokeDevice: (auth, id, confirmToken) => call(OkResponse, { method: 'POST', path: `${P}/devices/${seg(id)}/revoke`, body: { confirmToken } }, auth),
    setRecoveryTrust: (auth, id, password, trusted) =>
      call(DeviceInfo, { method: 'PUT', path: `${P}/devices/${seg(id)}/recovery-trust`, body: { password, trusted } }, auth),
    listSessions: (auth) => call(SessionListResponse, { method: 'GET', path: `${P}/sessions` }, auth),
    revokeSession: (auth, id) => call(OkResponse, { method: 'DELETE', path: `${P}/sessions/${seg(id)}` }, auth),
    revokeAllPreview: (auth) => call(ConfirmPreview, { method: 'POST', path: `${P}/sessions/revoke-all/preview` }, auth),
    revokeAll: (auth, confirmToken) => call(OkResponse, { method: 'POST', path: `${P}/sessions/revoke-all`, body: { confirmToken } }, auth),
    listAudit: (auth, query) => {
      const qs: string[] = [];
      if (query?.beforeSeq !== undefined) qs.push(`beforeSeq=${query.beforeSeq}`);
      if (query?.limit !== undefined) qs.push(`limit=${query.limit}`);
      return call(AuditListResponse, { method: 'GET', path: `${P}/audit${qs.length > 0 ? `?${qs.join('&')}` : ''}` }, auth);
    },
    recoveryCodesPreview: (auth) => call(ConfirmPreview, { method: 'POST', path: `${P}/owner/recovery-codes/preview` }, auth),
    regenerateRecoveryCodes: (auth, confirmToken) => call(RecoveryCodesResponse, { method: 'POST', path: `${P}/owner/recovery-codes`, body: { confirmToken } }, auth),
    changePassword: (auth, currentPassword, newPassword) => call(OkResponse, { method: 'POST', path: `${P}/owner/password`, body: { currentPassword, newPassword } }, auth),
  };
}
