import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '@dude/sqlite-store';
import { BACKUP_DRIVE_CONNECT_ACTION, BACKUP_DRIVE_CONNECT_CONSEQUENCE_CLASS, BACKUP_DRIVE_SCOPE } from '@dude/contracts/hub';
import { DestinationError, isDriveDefinition, revokeDriveToken, validateDriveClientSecret } from '../backup/destinations/index.js';
import type { BackupDestination, DriveCredentialStore, DriveEndpoints, DriveFetch } from '../backup/destinations/index.js';
import { DriveClient } from '../backup/destinations/drive/drive-client.js';
import { BACKUP_DESTINATIONS_MAX, DRIVE_CLIENT_ID_PATTERN } from '../config/hub-config.js';
import type { HubBackupDestinationConfig, HubBackupDriveDestination } from '../config/hub-config.js';
import { setSecretExpected } from '../provisioning/index.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import { AdminError } from './admin-endpoint.js';
import type { AdminMethod } from './admin-endpoint.js';
import type { PreparedDestination } from './backup-methods.js';
import type { AdminMethodContext } from './methods.js';

/**
 * The Google Drive destination's admin methods (32-SS1, Milestone 856, PD-154). Credential class: the local admin pipe only; no HTTP
 * route can start, complete or cancel a connect (the one route Google's redirect reaches only records an authorization in memory; see
 * `server/routes/drive-callback.ts`). Connecting WIDENS where encrypted backups go (to the owner's Google account) and stores a refresh
 * token, so it follows the Destructive-Action Contract's two steps and is tagged `secret-management` and `remote-write`:
 *
 * 1. `connect.preview` validates the OAuth client the owner brought, writes and contacts nothing, and stages a single-use 60-second
 *    ConfirmationStore token bound to the client id, a hash of the client secret, the redirect origin, the label and the destination
 *    being reconnected.
 * 2. `connect.apply` spends the token and starts ONE in-memory authorization (the consent URL; nothing is stored).
 * 3. The owner approves in the browser; Google redirects to the Hub's narrow callback, which exchanges the code and holds the refresh
 *    token in memory only. `connect.status` reports waiting, authorized, failed or expired.
 * 4. `connect.complete` takes the authorization, creates the app folder under the `drive.file` scope, writes the repository (the
 *    passphrase is needed here, exactly as for any new destination), stores the credentials in the secret store and only then
 *    writes the destination into `hub.json`. A failure anywhere removes what was created (credentials, the empty folder) and
 *    revokes the consent. Reconnecting an existing destination (after a revocation or a restore onto a new machine) re-stores the
 *    credentials for its recorded folder and needs no passphrase.
 *
 * Disconnecting is `backup destination remove` (two-step, `system-config`, `secret-management`, `remote-write`): it deletes the stored
 * authorization, revokes the token at Google when reachable, and never deletes the backups in Drive.
 *
 * The OAuth client secret, the code, the verifier and the tokens are never logged, audited, returned or put in an error.
 */
export interface DriveMethodHelpers {
  paths: () => NonNullable<AdminMethodContext['paths']>;
  config: () => { exposure: { proxy?: { publicOrigin: string } }; oidc?: { redirectOrigin: string } };
  destinationsOf: () => HubBackupDestinationConfig[];
  destinationById: (raw: unknown) => HubBackupDestinationConfig;
  openDestination: (definition: HubBackupDestinationConfig) => BackupDestination;
  passphraseOf: (params: Record<string, unknown>) => string;
  record: (params: unknown) => Record<string, unknown>;
  auditCli: (event: 'backup.destination-added', outcome: 'success' | 'failure', detail: Record<string, unknown>) => void;
  validLabel: (labelRaw: unknown) => void;
  addDestination: (prepared: PreparedDestination, passphrase: string | null) => Promise<{ definition: HubBackupDestinationConfig; added: boolean; adopted: boolean }>;
  describeDestination: (definition: HubBackupDestinationConfig) => Record<string, unknown>;
  saveSphere: () => Db | undefined;
  driveCredentials: () => DriveCredentialStore;
  driveFetch: () => DriveFetch;
  driveEndpoints: () => DriveEndpoints;
  ADMIN_BINDING: string;
}

const PREVIEW_KEYS = new Set(['clientId', 'clientSecret', 'label', 'redirectOrigin', 'id']);
const FOLDER_NAME = 'DUDE Hub backups';

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

export function buildDriveMethods(context: AdminMethodContext, shared: { now: () => number; confirmations: ConfirmationStore }, h: DriveMethodHelpers): Record<string, AdminMethod> {
  const { now, confirmations } = shared;
  const driveAuth = () => {
    if (!context.driveAuth) throw new AdminError('unavailable', 'Google Drive backups cannot be connected in this context.');
    return context.driveAuth;
  };
  /** What the one waiting authorization was started for (never a secret). */
  let meta: { pendingId: string; label: string | undefined; reconnectId: string | undefined } | undefined;

  const redirectOriginOf = (raw: unknown): string => {
    const current = h.config();
    const candidate = raw ?? current.exposure.proxy?.publicOrigin ?? current.oidc?.redirectOrigin;
    if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 256) {
      throw new AdminError('bad-request', 'redirectOrigin is required: the origin of this Hub that Google redirects the browser to (for example https://hub.example.com); register its callback in the OAuth client.');
    }
    let url: URL;
    try { url = new URL(candidate); } catch { throw new AdminError('bad-request', 'redirectOrigin must be an origin such as https://hub.example.com.'); }
    const loopback = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== candidate || (url.protocol !== 'https:' && !loopback)) throw new AdminError('bad-request', 'redirectOrigin must be an https origin written exactly (plain http only for localhost, 127.0.0.1 or [::1]).');
    return candidate;
  };

  /** The validated, secret-free facts of a connect request, and the digest the confirmation binds. */
  const parseConnect = (params: unknown) => {
    const input = h.record(params);
    for (const key of Object.keys(input)) if (!PREVIEW_KEYS.has(key) && key !== 'confirmToken' && key !== 'pendingId' && key !== 'passphrase') throw new AdminError('bad-request', 'Unknown parameter.');
    const clientId = input['clientId'];
    if (typeof clientId !== 'string' || !DRIVE_CLIENT_ID_PATTERN.test(clientId)) throw new AdminError('bad-request', 'clientId must be the OAuth client id (1 to 256 printable characters, no spaces).');
    const clientSecret = validateDriveClientSecret(input['clientSecret']);
    if (clientSecret === null) throw new AdminError('bad-request', 'The client secret must be the single value Google shows for the OAuth client (8 to 512 characters, no spaces or line breaks).');
    h.validLabel(input['label']);
    const label = typeof input['label'] === 'string' ? input['label'].trim() : undefined;
    const redirectOrigin = redirectOriginOf(input['redirectOrigin']);
    let reconnect: HubBackupDriveDestination | undefined;
    if (input['id'] !== undefined) {
      const found = h.destinationById(input['id']);
      if (!isDriveDefinition(found)) throw new AdminError('bad-request', 'That destination is not a Google Drive destination.');
      reconnect = found;
    } else if (h.destinationsOf().length >= BACKUP_DESTINATIONS_MAX) {
      throw new AdminError('conflict', `At most ${BACKUP_DESTINATIONS_MAX} backup destinations can be configured.`);
    }
    const digest = sha(JSON.stringify({ v: 1, id: reconnect?.id ?? null, clientId, secret: sha(clientSecret), redirectOrigin, label: label ?? null }));
    return { input, clientId, clientSecret, label, redirectOrigin, reconnect, digest };
  };

  const toAdminError = (error: unknown): AdminError => {
    if (error instanceof AdminError) return error;
    if (error instanceof DestinationError) return new AdminError(error.code === 'unavailable' || error.code === 'reauth' || error.code === 'auth' || error.code === 'quota' ? 'unavailable' : 'bad-request', error.message);
    return new AdminError('unavailable', 'Google Drive could not be reached.');
  };

  const clientFor = (credentials: { clientId: string; clientSecret: string; refreshToken: string }, folderId: string): DriveClient =>
    new DriveClient({ ...credentials, folderId, ...(context.driveTest?.client ?? {}) });
  const revoke = (refreshToken: string): Promise<boolean> => revokeDriveToken({ fetch: h.driveFetch(), endpoints: h.driveEndpoints(), refreshToken });

  return {
    /** Step one: validates the owner's OAuth client and reports what connecting does. Changes and contacts nothing. */
    'backup.destination.drive.connect.preview': (params) => {
      driveAuth();
      const request = parseConnect(params);
      const at = now();
      const confirmToken = confirmations.issue({ action: BACKUP_DRIVE_CONNECT_ACTION, digest: request.digest, bindingId: h.ADMIN_BINDING, now: at });
      return {
        confirmToken,
        expiresAt: ConfirmationStore.expiresAt(at),
        consequenceClass: [...BACKUP_DRIVE_CONNECT_CONSEQUENCE_CLASS],
        summary: {
          provider: 'Google Drive', scope: BACKUP_DRIVE_SCOPE, clientId: request.clientId, redirectUri: `${request.redirectOrigin}/api/v1/backup/drive/callback`,
          reconnect: request.reconnect !== undefined, ...(request.reconnect !== undefined ? { id: request.reconnect.id, folderId: request.reconnect.folderId } : { folderName: FOLDER_NAME }),
          note: 'Encrypted backups will be copied to your Google account. The Hub asks only for the drive.file scope: it can see and change only the files and folder it creates itself, never the rest of your Drive. '
            + 'Register the redirectUri above as an authorized redirect URI of your OAuth client first. The Hub keeps a refresh token protected on this computer; "backup destination remove" revokes it.',
        },
      };
    },
    /** Step two: spends the token and starts the one in-memory authorization; returns the consent URL. Stores nothing. */
    'backup.destination.drive.connect.apply': (params) => {
      const auth = driveAuth();
      const request = parseConnect(params);
      const token = request.input['confirmToken'];
      if (typeof token !== 'string' || token.length === 0) throw new AdminError('bad-request', 'confirmToken is required.');
      const verdict = confirmations.consumeDetailed({ token, action: BACKUP_DRIVE_CONNECT_ACTION, digest: request.digest, bindingId: h.ADMIN_BINDING, now: now() });
      if (verdict === 'invalid') throw new AdminError('confirmation-required', 'The confirmation is missing, expired or already used.');
      if (verdict === 'digest-mismatch') throw new AdminError('conflict', 'The request changed since the preview. Run the preview again.');
      const started = auth.begin({ clientId: request.clientId, clientSecret: request.clientSecret, redirectOrigin: request.redirectOrigin });
      meta = { pendingId: started.pendingId, label: request.label, reconnectId: request.reconnect?.id };
      return { pendingId: started.pendingId, authorizationUrl: started.authorizationUrl, redirectUri: started.redirectUri, expiresAt: started.expiresAt };
    },
    /** Where the waiting authorization stands (the owner approving in the browser). */
    'backup.destination.drive.connect.status': (params) => driveAuth().status(h.record(params)['pendingId']),
    'backup.destination.drive.connect.cancel': () => {
      driveAuth().cancel();
      meta = undefined;
      return { cancelled: true };
    },
    /**
     * Step three, after the owner approved: creates the app folder and the repository, stores the credentials and adds the destination
     * (or, with `id`, re-stores the credentials of an existing Drive destination). A new destination needs the backup passphrase.
     */
    'backup.destination.drive.connect.complete': async (params) => {
      const auth = driveAuth();
      const input = h.record(params);
      const pendingId = input['pendingId'];
      if (meta === undefined || meta.pendingId !== pendingId) throw new AdminError('refused', 'There is no matching Google Drive authorization; start the connect again.');
      const current = auth.status(pendingId);
      if (current.state !== 'authorized') throw new AdminError('refused', `The Google Drive authorization is not complete (${current.state}).`);
      const reconnect = meta.reconnectId === undefined ? undefined : h.destinationById(meta.reconnectId);
      if (reconnect !== undefined && !isDriveDefinition(reconnect)) throw new AdminError('bad-request', 'That destination is not a Google Drive destination.');
      const passphrase = reconnect === undefined ? h.passphraseOf(input) : null; // validated before the authorization is spent
      const taken = auth.take(pendingId);
      if (taken === undefined) throw new AdminError('refused', 'The Google Drive authorization expired; start the connect again.');
      const label = meta.label;
      meta = undefined;
      const credentials = { clientSecret: taken.clientSecret, refreshToken: taken.refreshToken };

      if (reconnect !== undefined && isDriveDefinition(reconnect)) {
        const previous = (() => { try { return h.driveCredentials().get(reconnect.id); } catch { return null; } })();
        try {
          if (taken.clientId !== reconnect.clientId) throw new AdminError('conflict', 'The OAuth client id differs from the one this destination was made with.');
          if (!(await clientFor({ clientId: taken.clientId, ...credentials }, reconnect.folderId).folderUsable())) throw new AdminError('not-found', 'The Google Drive folder of this destination was not found in that Google account.');
          h.driveCredentials().put(reconnect.id, credentials);
          const probe = await h.openDestination(reconnect).probe();
          if (!probe.ok) throw new AdminError('unavailable', `The Google Drive folder cannot be written (${probe.reason}).`);
        } catch (error) {
          try { if (previous !== null) h.driveCredentials().put(reconnect.id, previous); else h.driveCredentials().delete(reconnect.id); } catch { /* the next connect replaces it */ }
          await revoke(taken.refreshToken);
          throw toAdminError(error);
        }
        const sdb = h.saveSphere();
        if (sdb !== undefined) { try { setSecretExpected(sdb, 'backup.drive.refreshToken'); } catch { /* provisioning status only */ } }
        h.auditCli('backup.destination-added', 'success', { destination: reconnect.id, kind: 'drive', adopted: false, reconnected: true });
        return { added: false, reconnected: true, destination: h.describeDestination(reconnect) };
      }

      const id = `d-${randomBytes(4).toString('hex')}`;
      let folderId: string | undefined;
      const folderClient = clientFor({ clientId: taken.clientId, ...credentials }, '-');
      try {
        folderId = await folderClient.createFolder(FOLDER_NAME);
      } catch (error) {
        await revoke(taken.refreshToken);
        throw toAdminError(error);
      }
      const createdFolder = folderId;
      const definition: HubBackupDriveDestination = { id, kind: 'drive', label: label ?? 'Google Drive', folderId: createdFolder, clientId: taken.clientId };
      const prepared: PreparedDestination = {
        definition, same: undefined, failureNoun: 'Google Drive folder',
        storeCredentials: { purpose: 'backup.drive.refreshToken', put: () => h.driveCredentials().put(id, credentials), discard: () => { h.driveCredentials().delete(id); } },
        onFailure: async () => {
          try { await clientFor({ clientId: taken.clientId, ...credentials }, createdFolder).delete(createdFolder); } catch { /* an empty folder is left in Drive */ }
          await revoke(taken.refreshToken);
        },
      };
      const added = await h.addDestination(prepared, passphrase);
      return { added: true, adopted: added.adopted, destination: h.describeDestination(added.definition) };
    },
  };
}
