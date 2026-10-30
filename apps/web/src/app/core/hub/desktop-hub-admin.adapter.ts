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
    reachabilityEcho: (publicUrl) => run((h) => h.reachabilityEcho(publicUrl ?? '')),
    enroll: (pairingString) => run((h) => h.enroll(pairingString)),
    reconnect: (request) => run((h) => h.reconnect(request)),
    unenroll: (force) => run((h) => h.unenroll(force)),
    ownerStatus: () => run((h) => h.ownerStatus()),
    ownerSignIn: (password) => run((h) => h.ownerSignIn(password)),
    ownerSignOut: () => run((h) => h.ownerSignOut()),
    listDevices: () => run((h) => h.listDevices()),
    syncSummary: () => run((h) => h.syncSummary()),
    presence: () => run((h) => h.presence()),
    diagnostics: () => run((h) => h.diagnostics()),
    agentDiagnostics: () => run((h) => h.agentDiagnostics()),
    createPairingCode: (host, options) => run((h) => (options === undefined ? h.createPairingCode(host) : h.createPairingCode(host, options))),
    backupStatus: () => run((h) => h.backupStatus()),
    renameDevice: (id, name) => run((h) => h.renameDevice(id, name)),
    revokeDevicePreview: (id) => run((h) => h.revokeDevicePreview(id)),
    revokeDevice: (id, token) => run((h) => h.revokeDevice(id, token)),
    setRecoveryTrust: (id, password, trusted) => run((h) => h.setRecoveryTrust(id, password, trusted)),
    setNotificationsAccess: (id, enabled) => run((h) => h.setNotificationsAccess(id, enabled)),
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
    listJobs: () => run((h) => h.listJobs()),
    listNotifications: () => run((h) => h.listNotifications()),
    markNotificationsRead: (target) => run((h) => h.markNotificationsRead(target)),
    dismissNotification: (id) => run((h) => h.dismissNotification(id)),
    listCollabRooms: () => run((h) => h.listCollabRooms()),
    createCollabRoom: (name) => run((h) => h.createCollabRoom(name)),
    keepCollabRoom: (roomId, title) => run((h) => h.keepCollabRoom(roomId, title)),
    listCollabDocuments: () => run((h) => h.listCollabDocuments()),
    deleteCollabDocument: (id) => run((h) => h.deleteCollabDocument(id)),
    listCollabHistory: (doc) => run((h) => h.listCollabHistory(doc)),
    getCollabSnapshot: (snapshotId) => run((h) => h.getCollabSnapshot(snapshotId)),
    restoreCollabSnapshot: (snapshotId) => run((h) => h.restoreCollabSnapshot(snapshotId)),
    recoverOwner: (newPassword) => run((h) => h.recoverOwner(newPassword)),
    localHubInfo: () => run((h) => h.localHubInfo()),
    setupLocalHub: (request) => run((h) => h.setupLocalHub(request)),
    updateLocalHub: () => run((h) => h.updateLocalHub()),
    provisionOpen: () => run((h) => h.provisionOpen()),
    provisionStep: (request) => run((h) => h.provisionStep(request)),
    provisionChooseBackupFolder: () => run((h) => h.provisionChooseBackupFolder()),
    provisionClose: () => run((h) => h.provisionClose()),
    openWeb: () => run((h) => h.openWeb()),
    rootCertificatePreview: () => run((h) => h.rootCertificatePreview()),
    installRootCertificate: (token) => run((h) => h.installRootCertificate(token)),
    onStatusChanged: (callback) => bridge()?.onStatusChanged(callback) ?? (() => undefined),
    onProvisionProgress: (callback) => bridge()?.onProvisionProgress?.(callback) ?? (() => undefined),
    onNotification: (callback) => bridge()?.onNotification?.(callback) ?? (() => undefined),
    onOpenNotifications: (callback) => bridge()?.onOpenNotifications?.(callback) ?? (() => undefined),
    bootstrap: unavailable.bootstrap,
    signIn: unavailable.signIn,
    currentSession: unavailable.currentSession,
    signOut: unavailable.signOut,
    recover: unavailable.recover,
    ownerReset: unavailable.ownerReset,
  };
}
