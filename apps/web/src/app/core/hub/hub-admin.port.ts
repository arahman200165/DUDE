import type {
  AuditListResponse, SecurityAlertsResponse, BootstrapRequest, BootstrapResponse, ConfirmPreview, CurrentSessionResponse, DeviceInfo, DeviceListResponse, OkResponse, SyncSummary, HubDiagnosticsReport, ReachabilityEchoResponse, TlsCertificatesResponse,
  OwnerResetResponse, PairingCodeResponse, RecoveryCodesResponse, SessionListResponse, SignInResponse,
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

/**
 * Hub administration as the settings UI and the Hub web pages see it. The desktop host reaches the Hub through
 * the main process (`window.dude.hub`); the Hub-served web build calls the Hub's own origin with a cookie session.
 * The first group works on both hosts, the second only in the Hub-served build. Methods reject with `HubAdminError`.
 */
export interface HubAdminPort {
  status(): Promise<DesktopHubStatus>;
  probeLocal(port?: number): Promise<DesktopHubProbe>;
  enroll(pairingString: string): Promise<DesktopHubEnrollment>;
  unenroll(force?: boolean): Promise<{ readonly unenrolled: boolean; readonly hubNotified: boolean }>;
  ownerStatus(): Promise<DesktopHubOwnerStatus>;
  ownerSignIn(password: string): Promise<DesktopHubOwnerStatus>;
  ownerSignOut(): Promise<OkResponse>;
  listDevices(): Promise<DeviceListResponse>;
  syncSummary(): Promise<SyncSummary>;
  /** Owner only: the Hub's endpoint diagnostics report (exposure, certificate, readiness checks). View-only. */
  diagnostics(): Promise<HubDiagnosticsReport>;
  createPairingCode(host?: string): Promise<PairingCodeResponse>;
  renameDevice(deviceId: string, displayName: string): Promise<DeviceInfo>;
  revokeDevicePreview(deviceId: string): Promise<ConfirmPreview>;
  revokeDevice(deviceId: string, confirmToken: string): Promise<OkResponse>;
  setRecoveryTrust(deviceId: string, password: string, trusted: boolean): Promise<DeviceInfo>;
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

  /** Desktop only: pushed whenever the Device Agent's Hub connection state changes. Returns the unsubscribe function. */
  onStatusChanged?(callback: (status: DesktopHubStatus) => void): () => void;
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

  // Hub-served web build only (rejects `unavailable` elsewhere).
  bootstrap(request: BootstrapRequest): Promise<BootstrapResponse>;
  signIn(password: string): Promise<SignInResponse>;
  currentSession(): Promise<CurrentSessionResponse>;
  signOut(): Promise<OkResponse>;
  recover(recoveryCode: string, newPassword: string): Promise<SignInResponse>;
  ownerReset(resetToken: string, newPassword: string): Promise<OwnerResetResponse>;
}
