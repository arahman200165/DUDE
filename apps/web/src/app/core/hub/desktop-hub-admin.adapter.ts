import type { DesktopHubBridge, DesktopHubResult } from '@dude/contracts/shared/models/platform-bridge.model';
import { HUB_ADMIN_UNAVAILABLE, HubAdminError, HubAdminPort } from './hub-admin.port';
import { createUnavailableHubAdmin } from './unavailable-hub-admin.adapter';

/**
 * Desktop adapter over `window.dude.hub`. The bridge is looked up per call (it may appear after preload), an
 * absent bridge is `unavailable`, and a thrown IPC failure is normalized the same way as an error result.
 * The hub-web-only methods reject: the desktop owner session lives in the main process, not in the renderer.
 */
export function createDesktopHubAdmin(bridge: () => DesktopHubBridge | undefined): HubAdminPort {
  const unavailable = createUnavailableHubAdmin('Hub administration needs the DUDE desktop app with its Hub bridge.');
  async function run<T>(call: (hub: DesktopHubBridge) => Promise<DesktopHubResult<T>>): Promise<T> {
    const hub = bridge();
    if (hub === undefined) throw new HubAdminError(HUB_ADMIN_UNAVAILABLE, 'The desktop Hub bridge is not available.');
    let result: DesktopHubResult<T>;
    try {
      result = await call(hub);
    } catch (error) {
      throw new HubAdminError('internal', error instanceof Error ? error.message : 'The Hub request failed.');
    }
    if (!result.ok) throw new HubAdminError(result.error.code, result.error.message, result.error.retryAfterMs);
    return result.result;
  }
  return {
    status: () => run((h) => h.status()),
    probeLocal: (port) => run((h) => h.probeLocal(port)),
    enroll: (pairingString) => run((h) => h.enroll(pairingString)),
    unenroll: (force) => run((h) => h.unenroll(force)),
    ownerStatus: () => run((h) => h.ownerStatus()),
    ownerSignIn: (password) => run((h) => h.ownerSignIn(password)),
    ownerSignOut: () => run((h) => h.ownerSignOut()),
    listDevices: () => run((h) => h.listDevices()),
    syncSummary: () => run((h) => h.syncSummary()),
    diagnostics: () => run((h) => h.diagnostics()),
    agentDiagnostics: () => run((h) => h.agentDiagnostics()),
    createPairingCode: (host) => run((h) => h.createPairingCode(host)),
    renameDevice: (id, name) => run((h) => h.renameDevice(id, name)),
    revokeDevicePreview: (id) => run((h) => h.revokeDevicePreview(id)),
    revokeDevice: (id, token) => run((h) => h.revokeDevice(id, token)),
    setRecoveryTrust: (id, password, trusted) => run((h) => h.setRecoveryTrust(id, password, trusted)),
    listSessions: () => run((h) => h.listSessions()),
    revokeSession: (id) => run((h) => h.revokeSession(id)),
    revokeAllPreview: () => run((h) => h.revokeAllPreview()),
    revokeAll: (token) => run((h) => h.revokeAll(token)),
    listAudit: (beforeSeq) => run((h) => h.listAudit(beforeSeq)),
    listSecurityAlerts: () => run((h) => h.listSecurityAlerts()),
    markSecurityAlertsSeen: (upToSeq) => run((h) => h.markSecurityAlertsSeen(upToSeq)),
    recoveryCodesPreview: () => run((h) => h.recoveryCodesPreview()),
    regenerateRecoveryCodes: (token) => run((h) => h.regenerateRecoveryCodes(token)),
    changePassword: (current, next) => run((h) => h.changePassword(current, next)),
    recoverOwner: (newPassword) => run((h) => h.recoverOwner(newPassword)),
    localHubInfo: () => run((h) => h.localHubInfo()),
    setupLocalHub: (request) => run((h) => h.setupLocalHub(request)),
    updateLocalHub: () => run((h) => h.updateLocalHub()),
    openWeb: () => run((h) => h.openWeb()),
    rootCertificatePreview: () => run((h) => h.rootCertificatePreview()),
    installRootCertificate: (token) => run((h) => h.installRootCertificate(token)),
    onStatusChanged: (callback) => bridge()?.onStatusChanged(callback) ?? (() => undefined),
    bootstrap: unavailable.bootstrap,
    signIn: unavailable.signIn,
    currentSession: unavailable.currentSession,
    signOut: unavailable.signOut,
    recover: unavailable.recover,
    ownerReset: unavailable.ownerReset,
  };
}
