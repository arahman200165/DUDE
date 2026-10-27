import { Value } from 'typebox/value';
import Type from 'typebox';
import type { TSchema, Static } from 'typebox';
import {
  HUB_UPLOADS_PATH, uploadPath, uploadChunkPath, uploadCompletePath, UPLOAD_CHUNK_HASH_HEADER, UPLOAD_CONTENT_TYPE, UploadSession, UploadChunkResponse, UploadCompleteResponse,
  HUB_API_PREFIX, HUB_OIDC_PATHS, HUB_INGEST_PATHS, ingestRevokePath, ingestRevokePreviewPath, IngestTokenListResponse, IngestTokenCreateResponse, IngestTokenRevokePreview, IngestPingResponse, OidcStatusResponse, OidcStartResponse, OidcLinkCompleteResponse, OidcAccountsResponse, OidcUnlinkPreview, HelloResponse, ErrorEnvelope, checkProtocolCompatibility,
  BootstrapResponse, TlsCertificatesResponse, AuditListResponse, SecurityAlertsResponse, PresenceResponse, HUB_PRESENCE_PATH, HubJobsResponse, HUB_JOBS_PATH, HubQueueStatusResponse, HUB_QUEUE_PATH, HubProvisioningResponse, HUB_PROVISIONING_PATH, HubTunnelStatusResponse, HUB_TUNNEL_PATH, HubNotificationsResponse, HUB_NOTIFICATIONS_PATH, CollabRoom, CollabRoomsResponse, HUB_COLLAB_ROOMS_PATH, KeepCollabRoomResponse, CollabDocumentsResponse, HUB_COLLAB_DOCUMENTS_PATH, CollabHistoryResponse, CollabSnapshotResponse, CollabRestoreResponse, HUB_COLLAB_HISTORY_PATH, HubDiagnosticsReport, ReachabilityEchoResponse, BackupStatusResponse,
  EnrollResponse, DeviceChallengeResponse, DeviceRecoveryChallengeResponse, DeviceTokenResponse, DeviceInfo, DeviceListResponse, OwnerBearerResponse, PairingCodeResponse,
  OkResponse, ConfirmPreview, SessionListResponse, RecoveryCodesResponse,
  StepUpResponse, ChangePasswordResponse,
  SignInResponse, CurrentSessionResponse, OwnerResetResponse,
  SyncPushResponse, SyncChangesResponse, SyncSnapshotResponse, SyncStateResponse, SyncSummary, SyncClearPreview, SyncClearResponse, SYNC_PATHS,
  WEB_PATHS, WebAttachResponse, WebAccessResponse,
  assertSyncCategories,
} from '@dude/contracts/hub';
import type {
  IngestTokenCreateRequest, UploadCreateRequest, ProtocolCompatibility, MarkNotificationsReadRequest, BootstrapRequest, EnrollRequest, DeviceSelfUpdate, PairingCodeRequest, SyncOp, SyncStateReport, SyncCategory, WebAttachRequest,
} from '@dude/contracts/hub';
import type { HubRequest, HubTransport } from './transport.js';
import { HubApiError, HubProtocolError } from './errors.js';

export interface HubClientOptions {
  clientProtocol: number;
  minHubProtocol: number;
}

/** A bearer token (device `ddt_` or owner `dob_`), sent as the Authorization header. */
export type Bearer = string | undefined;

/** PD-102: a client that handles the `merged` push result declares it; one that omits `accept` is answered `conflict` as before. */
export interface SyncPushOptions {
  accept?: readonly 'merged'[];
}

const pushBody = (ops: readonly SyncOp[], options: SyncPushOptions | undefined): { ops: readonly SyncOp[]; accept?: readonly 'merged'[] } =>
  options?.accept && options.accept.length > 0 ? { ops, accept: options.accept } : { ops };

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
  /** Device token required: a 60 s nonce for device-assisted owner recovery (recovery-trusted desktop only). */
  deviceRecoveryChallenge(auth: Bearer): Promise<DeviceRecoveryChallengeResponse>;
  /** Device token required: signed nonce plus the new owner password. Revokes every owner session. */
  deviceRecover(auth: Bearer, body: { nonce: string; signature: string; newPassword: string }): Promise<OkResponse>;
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
  diagnostics(auth: Bearer): Promise<HubDiagnosticsReport>;
  /** Backup read model (owner session): authority epoch and state, the last backup, the schedule and how many devices await re-pairing. */
  backupStatus(auth: Bearer): Promise<BackupStatusResponse>;
  /** Hub-observed external reachability (owner session or device token): the Hub reports what it saw of THIS request's source. */
  reachabilityEcho(auth: Bearer): Promise<ReachabilityEchoResponse>;
  /** Security-relevant audit events of the last 30 days with the unseen count (owner session). */
  listSecurityAlerts(auth: Bearer): Promise<SecurityAlertsResponse>;
  markSecurityAlertsSeen(auth: Bearer, upToSeq: number): Promise<OkResponse>;
  /** Owner: every online registry row with its opted-in activity (PD-108). */
  presence(auth: Bearer): Promise<PresenceResponse>;
  /** Owner: read-only status of the Hub's background jobs (PD-112). */
  listJobs(auth: Bearer): Promise<HubJobsResponse>;
  /** Owner: read-only counts of the durable job queue and its recent failures (PD-147); no payloads, no way to enqueue or run work. */
  queueStatus(auth: Bearer): Promise<HubQueueStatusResponse>;
  /** Owner: read-only per-component SaveSphere provisioning status with copyable commands (PD-153); provisioning itself is the elevated `dude-hub provision` command, never a route. */
  provisioningStatus(auth: Bearer): Promise<HubProvisioningResponse>;
  /** Owner: read-only status of the managed Cloudflare Tunnel (PD-142, PD-143): state, hostname, the Cloudflare dashboard values, a bounded redacted log tail and the edge-TLS disclosure. Turning it on or off is the elevated `dude-hub network tunnel` command, never a route, and the connector token is never returned. */
  tunnelStatus(auth: Bearer): Promise<HubTunnelStatusResponse>;
  /**
   * Notifications (PD-109): owner session, or a device token whose desktop holds the notification-reader grant (PD-110; any other device token is 403).
   * Dismissed ones are listed only with `includeDismissed`. Marking read and dismissing are not audited.
   */
  listNotifications(auth: Bearer, options?: { includeDismissed?: boolean }): Promise<HubNotificationsResponse>;
  markNotificationsRead(auth: Bearer, target: MarkNotificationsReadRequest): Promise<OkResponse>;
  dismissNotification(auth: Bearer, id: string): Promise<OkResponse>;
  /** Owner with step-up: grants or revokes a desktop's notification-reader grant (400 for a browser row, 409 for an ended device). */
  setNotificationsAccess(auth: Bearer, deviceId: string, enabled: boolean): Promise<DeviceInfo>;
  /**
   * Markdown Workspace rooms on the Hub (PD-104): owner session or a device token (a device may host and join rooms). Rooms live in Hub
   * memory only; at most 8 at once (creating a ninth is HTTP 409). `keepCollabRoom` persists a room as a `markdown-doc` record and is
   * refused (403) unless the Markdown documents category is on for the caller.
   */
  listCollabRooms(auth: Bearer): Promise<CollabRoomsResponse>;
  createCollabRoom(auth: Bearer, name: string): Promise<CollabRoom>;
  keepCollabRoom(auth: Bearer, roomId: string, title: string): Promise<KeepCollabRoomResponse>;
  /** Kept Markdown documents (PD-104): owner session or a device token, both refused (403) unless the Markdown documents category is on for the caller. */
  listCollabDocuments(auth: Bearer): Promise<CollabDocumentsResponse>;
  /** Tombstones a kept document (404 when it does not exist or is already deleted); audited. */
  deleteCollabDocument(auth: Bearer, id: string): Promise<OkResponse>;
  /**
   * Document history (PD-105) of a persisted collaborative document (`kind:id`, never a room): owner session or a device token, each
   * refused (403) unless the document's sync category is on for the caller. Lists newest first; a snapshot preview carries the record
   * payload it holds. A restore snapshots the current state first, is applied as a forward edit and is audited (404 for an unknown snapshot).
   */
  listCollabHistory(auth: Bearer, doc: string): Promise<CollabHistoryResponse>;
  getCollabSnapshot(auth: Bearer, snapshotId: string): Promise<CollabSnapshotResponse>;
  restoreCollabSnapshot(auth: Bearer, snapshotId: string): Promise<CollabRestoreResponse>;
  recoveryCodesPreview(auth: Bearer): Promise<ConfirmPreview>;
  regenerateRecoveryCodes(auth: Bearer, confirmToken: string): Promise<RecoveryCodesResponse>;
  changePassword(auth: Bearer, currentPassword: string, newPassword: string): Promise<ChangePasswordResponse>;
  stepUp(auth: Bearer, password: string): Promise<StepUpResponse>;

  /**
   * Google sign-in (32-SS1, Milestone 842, PD-121, PD-145). `oidcStatus` and `oidcStart` need no credential: the status says whether to offer
   * Google, the start returns the authorization URL a browser navigates to (a failure is HTTP 503 code `oidc-unavailable`, and the password
   * still works). The provider's redirect back is a browser navigation to the Hub's callback route, never a client call.
   */
  oidcStatus(): Promise<OidcStatusResponse>;
  oidcStart(returnTo?: string): Promise<OidcStartResponse>;
  /** Owner COOKIE session plus step-up (the browser): leg one of linking another Google account; returns the authorization URL. */
  oidcLinkStart(returnTo?: string): Promise<OidcStartResponse>;
  /** Owner COOKIE session plus step-up: leg two, with the one-time `linkToken` the callback put in the return URL; binds the verified `sub`. 409 when already linked. */
  oidcLinkComplete(linkToken: string): Promise<OidcLinkCompleteResponse>;
  /** Owner (cookie: omit `auth`; or bearer): the linked Google accounts (display address and times; never the subject). */
  listOidcAccounts(auth: Bearer): Promise<OidcAccountsResponse>;
  /** Owner plus step-up: step one of an unlink; changes nothing, returns the single-use token and the consequence class. 409 for the last account. */
  unlinkOidcPreview(auth: Bearer, accountId: string): Promise<OidcUnlinkPreview>;
  unlinkOidc(auth: Bearer, accountId: string, confirmToken: string): Promise<OkResponse>;

  /**
   * Ingest tokens (32-SS1, Milestone 843, PD-119, PD-149). The management methods are the OWNER (cookie: omit `auth`; or an owner bearer) and the
   * create and revoke steps need step-up; `createIngestToken` returns the secret exactly once (store it at once, it cannot be read again), and a
   * revoke is two-step like every destructive Hub action. `ingestPing` is the one token-only call: `token` is the `dit_` secret, sent as the bearer,
   * and no other credential is accepted on `/api/v1/ingest/*` (an owner or device credential there is HTTP 401; so is an ingest token anywhere else).
   */
  listIngestTokens(auth: Bearer): Promise<IngestTokenListResponse>;
  createIngestToken(auth: Bearer, body: IngestTokenCreateRequest): Promise<IngestTokenCreateResponse>;
  revokeIngestTokenPreview(auth: Bearer, id: string): Promise<IngestTokenRevokePreview>;
  revokeIngestToken(auth: Bearer, id: string, confirmToken: string): Promise<OkResponse>;
  ingestPing(token: string): Promise<IngestPingResponse>;

  /**
   * Resumable chunked uploads into the Hub's blob store (32-SS1, Milestone 845, PD-118, PD-148). Owner credential only (cookie: omit `auth`; or an owner
   * bearer; a device token is 403, an ingest token 401). `createUpload` negotiates the chunk size (8 MiB by default) and returns the session;
   * `putUploadChunk` sends ONE chunk as raw bytes (`bytes` must be exactly the session's chunk size, or the remainder for the last chunk; it is idempotent by
   * index, so retry freely; `sha256` is the lower-case hex hash of `bytes`, which the Hub verifies); `uploadStatus` is the resume point;
   * `completeUpload` assembles and answers the blob identity (state `complete`), or the session (state `completing`) when a long assembly is still running:
   * call it again or poll the status. `abortUpload` is a single audited step that only removes the session's own staged bytes. Most callers want
   * `uploadFileResumable` (`./upload-file.ts`), which does all of this. A `HubTransport` must support `HubRequest.rawBody`; the mobile bridge does not yet.
   */
  createUpload(auth: Bearer, body: UploadCreateRequest): Promise<UploadSession>;
  uploadStatus(auth: Bearer, uploadId: string): Promise<UploadSession>;
  putUploadChunk(auth: Bearer, uploadId: string, index: number, bytes: Uint8Array, options?: { sha256?: string }): Promise<UploadChunkResponse>;
  completeUpload(auth: Bearer, uploadId: string): Promise<UploadCompleteResponse | UploadSession>;
  abortUpload(auth: Bearer, uploadId: string): Promise<OkResponse>;

  // Synchronization (Phase 31D). Device token required, except summary and the environment clear (owner).
  syncPush(auth: Bearer, ops: readonly SyncOp[], options?: SyncPushOptions): Promise<SyncPushResponse>;
  /** A cursor older than the Hub's retained history rejects with `HubApiError` status 410, code `cursor-expired`. */
  syncChanges(auth: Bearer, after: number, limit?: number, categories?: readonly SyncCategory[]): Promise<SyncChangesResponse>;
  /** Omit categories for legacy unfiltered reads; an explicit filter must be unique and nonempty. Re-enabled categories need a fresh snapshot. */
  syncSnapshot(auth: Bearer, page?: { afterType?: string; afterId?: string; limit?: number; categories?: readonly SyncCategory[] }): Promise<SyncSnapshotResponse>;
  syncReportState(auth: Bearer, report: SyncStateReport): Promise<SyncStateResponse>;
  syncSummary(auth: Bearer): Promise<SyncSummary>;
  syncClearPreview(auth: Bearer): Promise<SyncClearPreview>;
  syncClear(auth: Bearer, confirmationId: string): Promise<SyncClearResponse>;

  // Hub web records (Phase 31E). Owner cookie session plus CSRF only (no `auth`): the browser stores the cookie and the transport adds the token.
  webAttach(body: WebAttachRequest): Promise<WebAttachResponse>;
  webSnapshot(page?: { afterType?: string; afterId?: string; limit?: number }): Promise<SyncSnapshotResponse>;
  /** A cursor older than the retained history rejects with `HubApiError` status 410, code `cursor-expired`; no attached browser rejects 409 `not-attached`. */
  webChanges(after: number, limit?: number): Promise<SyncChangesResponse>;
  webPush(ops: readonly SyncOp[], options?: SyncPushOptions): Promise<SyncPushResponse>;
  webState(report: SyncStateReport): Promise<SyncStateResponse>;
  webAccessGet(): Promise<WebAccessResponse>;
  webAccessSet(category: SyncCategory, enabled: boolean): Promise<WebAccessResponse>;
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
    deviceRecoveryChallenge: (auth) => call(DeviceRecoveryChallengeResponse, { method: 'POST', path: `${P}/auth/device-recovery/challenge` }, auth),
    deviceRecover: (auth, body) => call(OkResponse, { method: 'POST', path: `${P}/auth/device-recovery`, body }, auth),
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
    diagnostics: (auth) => call(HubDiagnosticsReport, { method: 'GET', path: `${P}/diagnostics` }, auth),
    backupStatus: (auth) => call(BackupStatusResponse, { method: 'GET', path: `${P}/backup/status` }, auth),
    reachabilityEcho: (auth) => call(ReachabilityEchoResponse, { method: 'GET', path: `${P}/reachability/echo` }, auth),
    listSecurityAlerts: (auth) => call(SecurityAlertsResponse, { method: 'GET', path: `${P}/security/alerts` }, auth),
    markSecurityAlertsSeen: (auth, upToSeq) => call(OkResponse, { method: 'POST', path: `${P}/security/alerts/seen`, body: { upToSeq } }, auth),
    presence: (auth) => call(PresenceResponse, { method: 'GET', path: HUB_PRESENCE_PATH }, auth),
    listJobs: (auth) => call(HubJobsResponse, { method: 'GET', path: HUB_JOBS_PATH }, auth),
    queueStatus: (auth) => call(HubQueueStatusResponse, { method: 'GET', path: HUB_QUEUE_PATH }, auth),
    provisioningStatus: (auth) => call(HubProvisioningResponse, { method: 'GET', path: HUB_PROVISIONING_PATH }, auth),
    tunnelStatus: (auth) => call(HubTunnelStatusResponse, { method: 'GET', path: HUB_TUNNEL_PATH }, auth),
    listNotifications: (auth, options) => call(HubNotificationsResponse, { method: 'GET', path: `${HUB_NOTIFICATIONS_PATH}${options?.includeDismissed === true ? '?includeDismissed=true' : ''}` }, auth),
    markNotificationsRead: (auth, target) => call(OkResponse, { method: 'POST', path: `${HUB_NOTIFICATIONS_PATH}/read`, body: target }, auth),
    dismissNotification: (auth, id) => call(OkResponse, { method: 'POST', path: `${HUB_NOTIFICATIONS_PATH}/${seg(id)}/dismiss` }, auth),
    setNotificationsAccess: (auth, id, enabled) => call(DeviceInfo, { method: 'PUT', path: `${P}/devices/${seg(id)}/notifications-access`, body: { enabled } }, auth),
    listCollabRooms: (auth) => call(CollabRoomsResponse, { method: 'GET', path: HUB_COLLAB_ROOMS_PATH }, auth),
    createCollabRoom: (auth, name) => call(CollabRoom, { method: 'POST', path: HUB_COLLAB_ROOMS_PATH, body: { name } }, auth),
    keepCollabRoom: (auth, roomId, title) => call(KeepCollabRoomResponse, { method: 'POST', path: `${HUB_COLLAB_ROOMS_PATH}/${seg(roomId)}/keep`, body: { title } }, auth),
    listCollabDocuments: (auth) => call(CollabDocumentsResponse, { method: 'GET', path: HUB_COLLAB_DOCUMENTS_PATH }, auth),
    deleteCollabDocument: (auth, id) => call(OkResponse, { method: 'DELETE', path: `${HUB_COLLAB_DOCUMENTS_PATH}/${seg(id)}` }, auth),
    listCollabHistory: (auth, doc) => call(CollabHistoryResponse, { method: 'GET', path: `${HUB_COLLAB_HISTORY_PATH}?${new URLSearchParams({ doc }).toString()}` }, auth),
    getCollabSnapshot: (auth, id) => call(CollabSnapshotResponse, { method: 'GET', path: `${HUB_COLLAB_HISTORY_PATH}/${seg(id)}` }, auth),
    restoreCollabSnapshot: (auth, id) => call(CollabRestoreResponse, { method: 'POST', path: `${HUB_COLLAB_HISTORY_PATH}/${seg(id)}/restore` }, auth),
    listAudit: (auth, query) => {
      const qs: string[] = [];
      if (query?.beforeSeq !== undefined) qs.push(`beforeSeq=${query.beforeSeq}`);
      if (query?.limit !== undefined) qs.push(`limit=${query.limit}`);
      return call(AuditListResponse, { method: 'GET', path: `${P}/audit${qs.length > 0 ? `?${qs.join('&')}` : ''}` }, auth);
    },
    recoveryCodesPreview: (auth) => call(ConfirmPreview, { method: 'POST', path: `${P}/owner/recovery-codes/preview` }, auth),
    regenerateRecoveryCodes: (auth, confirmToken) => call(RecoveryCodesResponse, { method: 'POST', path: `${P}/owner/recovery-codes`, body: { confirmToken } }, auth),
    changePassword: (auth, currentPassword, newPassword) => call(ChangePasswordResponse, { method: 'POST', path: `${P}/owner/password`, body: { currentPassword, newPassword } }, auth),
    stepUp: (auth, password) => call(StepUpResponse, { method: 'POST', path: `${P}/auth/step-up`, body: { password } }, auth),

    oidcStatus: () => call(OidcStatusResponse, { method: 'GET', path: HUB_OIDC_PATHS.status }),
    oidcStart: (returnTo) => call(OidcStartResponse, { method: 'POST', path: HUB_OIDC_PATHS.start, body: returnTo === undefined ? {} : { returnTo } }),
    oidcLinkStart: (returnTo) => call(OidcStartResponse, { method: 'POST', path: HUB_OIDC_PATHS.linkStart, body: returnTo === undefined ? {} : { returnTo } }),
    oidcLinkComplete: (linkToken) => call(OidcLinkCompleteResponse, { method: 'POST', path: HUB_OIDC_PATHS.linkComplete, body: { linkToken } }),
    listOidcAccounts: (auth) => call(OidcAccountsResponse, { method: 'GET', path: HUB_OIDC_PATHS.accounts }, auth),
    unlinkOidcPreview: (auth, accountId) => call(OidcUnlinkPreview, { method: 'POST', path: HUB_OIDC_PATHS.unlinkPreview, body: { accountId } }, auth),
    unlinkOidc: (auth, accountId, confirmToken) => call(OkResponse, { method: 'POST', path: HUB_OIDC_PATHS.unlink, body: { accountId, confirmToken } }, auth),

    listIngestTokens: (auth) => call(IngestTokenListResponse, { method: 'GET', path: HUB_INGEST_PATHS.tokens }, auth),
    createIngestToken: (auth, body) => call(IngestTokenCreateResponse, { method: 'POST', path: HUB_INGEST_PATHS.tokens, body }, auth),
    revokeIngestTokenPreview: (auth, id) => call(IngestTokenRevokePreview, { method: 'POST', path: ingestRevokePreviewPath(id) }, auth),
    revokeIngestToken: (auth, id, confirmToken) => call(OkResponse, { method: 'POST', path: ingestRevokePath(id), body: { confirmToken } }, auth),
    ingestPing: (token) => call(IngestPingResponse, { method: 'GET', path: HUB_INGEST_PATHS.ping }, token),

    createUpload: (auth, body) => call(UploadSession, { method: 'POST', path: HUB_UPLOADS_PATH, body }, auth),
    uploadStatus: (auth, id) => call(UploadSession, { method: 'GET', path: uploadPath(id) }, auth),
    putUploadChunk: (auth, id, index, bytes, options) =>
      call(UploadChunkResponse, {
        method: 'PUT', path: uploadChunkPath(id, index), rawBody: bytes,
        headers: { 'content-type': UPLOAD_CONTENT_TYPE, ...(options?.sha256 === undefined ? {} : { [UPLOAD_CHUNK_HASH_HEADER]: options.sha256 }) },
      }, auth),
    completeUpload: (auth, id) => call(Type.Union([UploadCompleteResponse, UploadSession]), { method: 'POST', path: uploadCompletePath(id) }, auth),
    abortUpload: (auth, id) => call(OkResponse, { method: 'DELETE', path: uploadPath(id) }, auth),

    syncPush: (auth, ops, options) => call(SyncPushResponse, { method: 'POST', path: `${P}${SYNC_PATHS.push}`, body: pushBody(ops, options) }, auth),
    syncChanges: async (auth, after, limit, categories) => {
      const qs = new URLSearchParams({ after: String(after), ...(limit !== undefined ? { limit: String(limit) } : {}) });
      if (categories !== undefined) { assertSyncCategories(categories); qs.set('categories', categories.join(',')); }
      return call(SyncChangesResponse, { method: 'GET', path: `${P}${SYNC_PATHS.changes}?${qs.toString()}` }, auth);
    },
    syncSnapshot: async (auth, page) => {
      const qs = new URLSearchParams();
      if (page?.afterType !== undefined) qs.set('afterType', page.afterType);
      if (page?.afterId !== undefined) qs.set('afterId', page.afterId);
      if (page?.limit !== undefined) qs.set('limit', String(page.limit));
      if (page?.categories !== undefined) { assertSyncCategories(page.categories); qs.set('categories', page.categories.join(',')); }
      const query = qs.toString();
      return call(SyncSnapshotResponse, { method: 'GET', path: `${P}${SYNC_PATHS.snapshot}${query ? `?${query}` : ''}` }, auth);
    },
    syncReportState: (auth, report) => call(SyncStateResponse, { method: 'PUT', path: `${P}${SYNC_PATHS.state}`, body: report }, auth),
    syncSummary: (auth) => call(SyncSummary, { method: 'GET', path: `${P}${SYNC_PATHS.summary}` }, auth),
    syncClearPreview: (auth) => call(SyncClearPreview, { method: 'POST', path: `${P}${SYNC_PATHS.clearPreview}` }, auth),
    syncClear: (auth, confirmationId) => call(SyncClearResponse, { method: 'POST', path: `${P}${SYNC_PATHS.clear}`, body: { confirmationId } }, auth),

    webAttach: (body) => call(WebAttachResponse, { method: 'POST', path: `${P}${WEB_PATHS.attach}`, body }),
    webSnapshot: (page) => {
      const qs = new URLSearchParams();
      if (page?.afterType !== undefined) qs.set('afterType', page.afterType);
      if (page?.afterId !== undefined) qs.set('afterId', page.afterId);
      if (page?.limit !== undefined) qs.set('limit', String(page.limit));
      const query = qs.toString();
      return call(SyncSnapshotResponse, { method: 'GET', path: `${P}${WEB_PATHS.snapshot}${query ? `?${query}` : ''}` });
    },
    webChanges: (after, limit) => {
      const qs = new URLSearchParams({ after: String(after), ...(limit !== undefined ? { limit: String(limit) } : {}) });
      return call(SyncChangesResponse, { method: 'GET', path: `${P}${WEB_PATHS.changes}?${qs.toString()}` });
    },
    webPush: (ops, options) => call(SyncPushResponse, { method: 'POST', path: `${P}${WEB_PATHS.push}`, body: pushBody(ops, options) }),
    webState: (report) => call(SyncStateResponse, { method: 'PUT', path: `${P}${WEB_PATHS.state}`, body: report }),
    webAccessGet: () => call(WebAccessResponse, { method: 'GET', path: `${P}${WEB_PATHS.access}` }),
    webAccessSet: (category, enabled) => call(WebAccessResponse, { method: 'PUT', path: `${P}${WEB_PATHS.access}`, body: { category, enabled } }),
  };
}
