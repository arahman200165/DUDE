import { HUB_ADMIN_UNAVAILABLE, HubAdminError, HubAdminPort } from './hub-admin.port';

/** Rejects every call: the standalone web build (and a desktop build without the Hub bridge) cannot administer a Hub. */
export function createUnavailableHubAdmin(reason = 'Hub administration is not available in this app.'): HubAdminPort {
  const reject = (): Promise<never> => Promise.reject(new HubAdminError(HUB_ADMIN_UNAVAILABLE, reason));
  return {
    status: reject, probeLocal: reject, enroll: reject, reconnect: reject, unenroll: reject, ownerStatus: reject, ownerSignIn: reject, ownerSignOut: reject,
    listDevices: reject, syncSummary: reject, diagnostics: reject, createPairingCode: reject, backupStatus: reject, renameDevice: reject, revokeDevicePreview: reject, revokeDevice: reject, setRecoveryTrust: reject,
    listSessions: reject, revokeSession: reject, revokeAllPreview: reject, revokeAll: reject, listAudit: reject, listSecurityAlerts: reject, markSecurityAlertsSeen: reject, recoveryCodesPreview: reject,
    regenerateRecoveryCodes: reject, changePassword: reject, bootstrap: reject, signIn: reject, currentSession: reject, signOut: reject,
    recover: reject, ownerReset: reject,
  };
}
