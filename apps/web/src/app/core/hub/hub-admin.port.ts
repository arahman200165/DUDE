import type {
  AuditListResponse, BackupStatusResponse, SecurityAlertsResponse, BootstrapRequest, BootstrapResponse, ConfirmPreview, CurrentSessionResponse, DeviceInfo, DeviceListResponse, OkResponse, SyncSummary, HubDiagnosticsReport, ReachabilityEchoResponse, TlsCertificatesResponse,
  OwnerResetResponse, PairingCodeResponse, PresenceEntry, PresenceResponse, RecoveryCodesResponse, SessionListResponse, SignInResponse,
  HubJobsResponse, HubNotificationsResponse, MarkNotificationsReadRequest, NotificationEventData,
  CollabRoom, CollabRoomsResponse, KeepCollabRoomResponse, CollabDocumentsResponse, CollabHistoryResponse, CollabSnapshotResponse, CollabRestoreResponse,
  OidcStatusResponse, OidcStartResponse, OidcLinkCompleteResponse, OidcAccountsResponse, OidcUnlinkPreview,
  HubProvisioningResponse, HubTunnelStatusResponse,
} from '@dude/contracts/hub';
import type { AgentDiagnostics } from '@dude/contracts';
import type {
  DesktopHubEnrollment, DesktopHubOwnerStatus, DesktopHubProbe, DesktopHubStatus, DesktopLocalHubInfo, DesktopRootCertificatePreview, DesktopLocalHubSetupRequest, DesktopLocalHubSetupResult,
  DesktopLocalHubUpdateResult,
} from '@dude/contracts/shared/models/platform-bridge.model';

export type {
  DesktopLocalHubInfo as LocalHubInfo, DesktopLocalHubSetupRequest as LocalHubSetupRequest, DesktopLocalHubSetupResult as LocalHubSetupResult,
  DesktopLocalHubUpdateResult as LocalHubUpdateResult,
};
export type { DesktopRootCertificatePreview as RootCertificatePreview };
export type { DesktopHubEnrollment as HubEnrollment, DesktopHubOwnerStatus as HubOwnerStatus, DesktopHubProbe as HubProbe, DesktopHubStatus as HubStatus };

/** Every Hub administration failure, whichever host produced it. `unavailable` means this host cannot administer a Hub at all. */
export class HubAdminError extends Error {
  constructor(readonly code: string, message: string, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'HubAdminError';
  }
}

export const HUB_ADMIN_UNAVAILABLE = 'unavailable';

/** True for the Hub's refusal of a kept-document call because the Markdown documents category is off for the caller (PD-103). */
export function isCollabConsentRefusal(error: unknown): boolean {
  return error instanceof HubAdminError && (error.code === 'forbidden' || error.code === 'hub-forbidden');
}

/**
 * Hub administration as the settings UI and the Hub web pages see it. The desktop host reaches the Hub through
 * the main process (`window.dude.hub`); the Hub-served web build calls the Hub's own origin with a cookie session.
 * The first group works on both hosts, the second only in the Hub-served build. Methods reject with `HubAdminError`.
 */
export interface HubAdminPort {
  status(): Promise<DesktopHubStatus>;
  probeLocal(port?: number): Promise<DesktopHubProbe>;
  enroll(pairingString: string): Promise<DesktopHubEnrollment>;
  /**
   * Desktop only: reconnects this ENROLLED device to a changed Hub (restored, moved or replaced) with a new pairing code, keeping its local
   * data and pending changes (a recovery snapshot is taken first). `acknowledged` must be `true`. Hub-served web: rejects `unavailable`.
   * Codes: `not-enrolled`, `not-reconnectable`, `snapshot-failed`, `pairing-rejected`, `tls-pin-mismatch`, `hub-unreachable`, `incompatible`, ...
   */
  reconnect(request: { readonly pairingString: string; readonly acknowledged: true; readonly trustChange?: { readonly mode: 'pinned' | 'public-ca'; readonly domain: string | null } }): Promise<DesktopHubEnrollment>;
  unenroll(force?: boolean): Promise<{ readonly unenrolled: boolean; readonly hubNotified: boolean }>;
  ownerStatus(): Promise<DesktopHubOwnerStatus>;
  ownerSignIn(password: string): Promise<DesktopHubOwnerStatus>;
  ownerSignOut(): Promise<OkResponse>;
  listDevices(): Promise<DeviceListResponse>;
  syncSummary(): Promise<SyncSummary>;
  /** Owner only: who is online and what each device that opted in is showing (PD-108). Held in Hub memory only, so a device that shares nothing has `activity: null`. */
  presence(): Promise<PresenceResponse>;
  /** Owner only: the Hub's endpoint diagnostics report (exposure, certificate, readiness checks). View-only. */
  diagnostics(): Promise<HubDiagnosticsReport>;
  /**
   * Creates a one-time pairing code (step-up applies as before). `options.reattachDeviceId` binds it to a device a Hub restore marked
   * `needsRePair`: only that device can use it (Settings > Environment & Hub > Reconnect) and its local data is kept. Without options: unchanged.
   */
  createPairingCode(host?: string, options?: { readonly reattachDeviceId?: string }): Promise<PairingCodeResponse>;
  /**
   * Owner only: the Hub's backup state (authority, last backup, schedule, default folder, devices needing re-pair). View-only.
   * A transferred Hub rejects with the distinct code `hub-transferred`.
   */
  backupStatus(): Promise<BackupStatusResponse>;
  renameDevice(deviceId: string, displayName: string): Promise<DeviceInfo>;
  revokeDevicePreview(deviceId: string): Promise<ConfirmPreview>;
  revokeDevice(deviceId: string, confirmToken: string): Promise<OkResponse>;
  setRecoveryTrust(deviceId: string, password: string, trusted: boolean): Promise<DeviceInfo>;
  /**
   * Owner only: grants or revokes a desktop's notification-reader grant (PD-110): that computer may then list, read and dismiss Hub notifications
   * and receive them live without an owner session. Hub web: the cookie session; a `step-up-required` answer prompts for the owner password once and retries.
   * Desktop: the Agent's owner bearer (always stepped up). The Hub answers 400 for a browser row and 409 for an ended device.
   */
  setNotificationsAccess(deviceId: string, enabled: boolean): Promise<DeviceInfo>;
  listSessions(): Promise<SessionListResponse>;
  revokeSession(sessionId: string): Promise<OkResponse>;
  revokeAllPreview(): Promise<ConfirmPreview>;
  revokeAll(confirmToken: string): Promise<OkResponse>;
  listAudit(beforeSeq?: number): Promise<AuditListResponse>;
  /** Owner only: recent security-relevant audit events, with how many the owner has not yet seen. */
  listSecurityAlerts(): Promise<SecurityAlertsResponse>;
  markSecurityAlertsSeen(upToSeq: number): Promise<OkResponse>;
  recoveryCodesPreview(): Promise<ConfirmPreview>;
  regenerateRecoveryCodes(confirmToken: string): Promise<RecoveryCodesResponse>;
  changePassword(currentPassword: string, newPassword: string): Promise<OkResponse>;
  /** Owner only: the Hub's background jobs and their last outcome (PD-112). Read-only: there is no call that runs or changes a job. */
  listJobs(): Promise<HubJobsResponse>;
  /**
   * The Hub's notifications, newest first (PD-109). Hub web: the owner's cookie session. Desktop: the Agent reads them with the owner session when the
   * owner is signed in on this desktop, otherwise with this device's token, which the Hub accepts only after the owner granted this device notification
   * access (PD-110); neither gives the code `notifications-unavailable`.
   */
  listNotifications(): Promise<HubNotificationsResponse>;
  markNotificationsRead(target: MarkNotificationsReadRequest): Promise<OkResponse>;
  dismissNotification(id: string): Promise<OkResponse>;
  /**
   * Markdown Workspace Hub rooms (PD-104): the rooms open in Hub memory, a new one, and "Keep on Hub", which persists a room as a kept
   * `markdown-doc` record. Hub web: the owner's cookie session. Desktop: this device's token through the Agent (a device may host, join and
   * keep rooms). Keeping, listing and deleting kept documents need the Markdown documents sync category on for the caller: the refusal is
   * `forbidden` on Hub web and `hub-forbidden` on desktop (see `isCollabConsentRefusal`).
   */
  listCollabRooms(): Promise<CollabRoomsResponse>;
  createCollabRoom(name: string): Promise<CollabRoom>;
  keepCollabRoom(roomId: string, title: string): Promise<KeepCollabRoomResponse>;
  listCollabDocuments(): Promise<CollabDocumentsResponse>;
  deleteCollabDocument(id: string): Promise<OkResponse>;
  /**
   * Document history (PD-105) of a persisted collaborative document (`scratchpad:…`, `user-script:…`, `markdown-doc:…`; never a room):
   * the snapshots newest first, one snapshot's record payload (the preview), and a restore, which the Hub applies as a forward edit after
   * snapshotting the current state (live sessions receive it through the collaboration socket). Hub web: the owner's cookie session (CSRF on
   * the restore). Desktop: this device's token through the Agent. Each needs the document's sync category on for the caller (`isCollabConsentRefusal`).
   */
  listCollabHistory(doc: string): Promise<CollabHistoryResponse>;
  getCollabSnapshot(snapshotId: string): Promise<CollabSnapshotResponse>;
  restoreCollabSnapshot(snapshotId: string): Promise<CollabRestoreResponse>;

  /** Desktop only: pushed whenever the Device Agent's Hub connection state changes. Returns the unsubscribe function. */
  onStatusChanged?(callback: (status: DesktopHubStatus) => void): () => void;
  /** Hub-served web build only: the Hub's live `presence-changed` events, pushed over this page's realtime link. Returns the unsubscribe function. */
  onPresenceChanged?(callback: (entry: PresenceEntry) => void): () => void;
  /** A notification arrived (the Hub's `notification` event: id, kind, severity, title). Hub-served web: this page's realtime link; desktop: the Agent's push. Returns the unsubscribe function. */
  onNotification?(callback: (notification: NotificationEventData) => void): () => void;
  /** Desktop only: the user clicked an OS notification raised by the main process; the shell opens the bell panel. Returns the unsubscribe function. */
  onOpenNotifications?(callback: () => void): () => void;
  /** Desktop only: device-assisted owner recovery from a recovery-trusted desktop, after Windows confirms the user. */
  recoverOwner?(newPassword: string): Promise<{ readonly ok: true }>;
  /** Desktop only: the Hub on this PC (installed, running, set up, version, bundled update available). */
  localHubInfo?(): Promise<DesktopLocalHubInfo>;
  /** Desktop only: first-run setup of the installed Hub (UAC prompt, bootstrap, pairs this PC, signs the owner in). The result carries the one-time recovery codes. */
  setupLocalHub?(request: DesktopLocalHubSetupRequest): Promise<DesktopLocalHubSetupResult>;
  /** Desktop only: updates the installed Hub from the Hub bundled with the app (UAC prompt; the Hub is briefly down). */
  updateLocalHub?(): Promise<DesktopLocalHubUpdateResult>;
  /** Desktop only: opens the enrolled Hub's web page in the default browser. No URL is passed; main resolves it and only opens `https:`. */
  openWeb?(): Promise<{ readonly ok: true }>;
  /** Desktop only, step 1: the Hub's local-CA root fingerprint and a single-use token. `available: false` when the Hub has no local CA or this is not Windows. Changes nothing. */
  rootCertificatePreview?(): Promise<DesktopRootCertificatePreview>;
  /** Desktop only, step 2: adds the previewed root to the CURRENT USER's Trusted Root store. */
  installRootCertificate?(confirmToken: string): Promise<{ readonly installed: true }>;
  /** Desktop only: this device's own connection report (state, pins, latency, clock skew, sync counts). No owner session needed. */
  agentDiagnostics?(): Promise<AgentDiagnostics>;
  /**
   * The Hub reports what it observed of the request's source and records a verification when it came from a public address through a
   * configured name. Hub web: this browser's own origin (any argument is ignored). Desktop: this device's agent calls the supplied PUBLIC
   * origin (`https://name[:port]`; required) with its device token and reports its round trip. Absent elsewhere.
   */
  reachabilityEcho?(publicUrl?: string): Promise<ReachabilityEchoResponse & { readonly rttMs?: number }>;
  /** Hub-served web build only: the Hub's public TLS certificates route (active pin, source, public local-CA root). */
  tlsCertificates?(): Promise<TlsCertificatesResponse>;
  /** Hub-served web build only: the `Date` header of a public Hub response, for the browser's clock-skew check; null when absent. */
  serverDate?(): Promise<string | null>;
  /** Hub-served web build only: the Hub's TLS public-key pin (and the pending next pin during rotation). */
  tlsFingerprint?(): Promise<{ readonly spkiSha256: string; readonly nextSpkiSha256: string | null }>;

  /**
   * Google sign-in (32-SS1, Milestone 842, PD-121, PD-145), Hub-served web build only (absent on desktop and the standalone web build, where the
   * Security panel and the sign-in button simply do not render). `oidcStatus` and `oidcSignInStart` need no session. `oidcSignInStart` returns the
   * Google authorization URL to navigate to and rejects `oidc-unavailable` when Google, the client secret or the configuration cannot serve a
   * sign-in (the password still works). The link calls need the owner session and step-up (the adapter prompts for the password and retries,
   * like every guarded call): `oidcLinkStart` returns the URL for linking ANOTHER Google account, and `oidcLinkComplete` is the second leg
   * with the one-time token Google's redirect put in the page address (`conflict` when that account is already linked, `forbidden` when the
   * request expired or belongs to another session). Unlinking is two-step: the preview changes nothing; `conflict` means the last account.
   */
  oidcStatus?(): Promise<OidcStatusResponse>;
  oidcSignInStart?(returnTo?: string): Promise<OidcStartResponse>;
  listOidcAccounts?(): Promise<OidcAccountsResponse>;
  oidcLinkStart?(returnTo?: string): Promise<OidcStartResponse>;
  oidcLinkComplete?(linkToken: string): Promise<OidcLinkCompleteResponse>;
  unlinkOidcPreview?(accountId: string): Promise<OidcUnlinkPreview>;
  unlinkOidc?(accountId: string, confirmToken: string): Promise<OkResponse>;

  /**
   * Platform status (32-SS1, Milestone 852), Hub-served web build only (absent on desktop and the standalone web build, where Settings does not
   * render the Platform panel). Owner session reads of the Hub's own read-only routes: `provisioningStatus` is `GET /api/v1/provisioning` (per-component
   * state, secrets to re-enter, the copyable commands) and `tunnelStatus` is `GET /api/v1/tunnel` (connector state and the Cloudflare dashboard values).
   * There is no write counterpart: turning the tunnel on, the power policy, standby grants and backups are elevated CLI commands, never a port method,
   * so nothing reachable from a browser session can widen exposure.
   */
  provisioningStatus?(): Promise<HubProvisioningResponse>;
  tunnelStatus?(): Promise<HubTunnelStatusResponse>;

  // Hub-served web build only (rejects `unavailable` elsewhere).
  bootstrap(request: BootstrapRequest): Promise<BootstrapResponse>;
  signIn(password: string): Promise<SignInResponse>;
  currentSession(): Promise<CurrentSessionResponse>;
  signOut(): Promise<OkResponse>;
  recover(recoveryCode: string, newPassword: string): Promise<SignInResponse>;
  ownerReset(resetToken: string, newPassword: string): Promise<OwnerResetResponse>;
}
