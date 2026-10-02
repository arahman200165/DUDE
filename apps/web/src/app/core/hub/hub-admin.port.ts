import type {
  AuditListResponse, BootstrapRequest, BootstrapResponse, ConfirmPreview, CurrentSessionResponse, DeviceInfo, DeviceListResponse, OkResponse,
  OwnerResetResponse, PairingCodeResponse, RecoveryCodesResponse, SessionListResponse, SignInResponse,
} from '@dude/contracts/hub';
import type { DesktopHubEnrollment, DesktopHubOwnerStatus, DesktopHubProbe, DesktopHubStatus } from '@dude/contracts/shared/models/platform-bridge.model';

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
  recoveryCodesPreview(): Promise<ConfirmPreview>;
  regenerateRecoveryCodes(confirmToken: string): Promise<RecoveryCodesResponse>;
  changePassword(currentPassword: string, newPassword: string): Promise<OkResponse>;

  // Hub-served web build only (rejects `unavailable` elsewhere).
  bootstrap(request: BootstrapRequest): Promise<BootstrapResponse>;
  signIn(password: string): Promise<SignInResponse>;
  currentSession(): Promise<CurrentSessionResponse>;
  signOut(): Promise<OkResponse>;
  recover(recoveryCode: string, newPassword: string): Promise<SignInResponse>;
  ownerReset(resetToken: string, newPassword: string): Promise<OwnerResetResponse>;
}
