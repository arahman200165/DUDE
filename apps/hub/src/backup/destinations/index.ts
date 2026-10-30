import { tmpdir } from 'node:os';
import path from 'node:path';
import type { HubPaths } from '../../config/data-dir.js';
import type { HubBackupDestinationConfig, HubBackupDriveDestination, HubBackupOneDriveDestination, HubBackupS3Destination } from '../../config/hub-config.js';
import type { BackupDestination } from './destination.js';
import { DestinationError } from './destination.js';
import { assertSafeLocalFolder, createLocalFolderDestination } from './local-folder.js';
import { createS3Destination } from './s3/s3-destination.js';
import type { S3DestinationOptions } from './s3/s3-destination.js';
import { defaultS3CredentialStore } from './s3/s3-credentials.js';
import type { S3CredentialStore } from './s3/s3-credentials.js';
import { createDriveDestination } from './drive/drive-destination.js';
import type { DriveDestinationOptions } from './drive/drive-destination.js';
import { defaultDriveCredentialStore } from './drive/drive-credentials.js';
import type { DriveCredentialStore } from './drive/drive-credentials.js';
import { createOneDriveDestination } from './onedrive/onedrive-destination.js';
import type { OneDriveDestinationOptions } from './onedrive/onedrive-destination.js';
import { defaultOneDriveCredentialStore } from './onedrive/onedrive-credentials.js';
import type { OneDriveCredentialStore } from './onedrive/onedrive-credentials.js';

export * from './destination.js';
export { assertSafeLocalFolder, createLocalFolderDestination, isInsideFolder } from './local-folder.js';
export { createS3Destination, S3_PART_BYTES } from './s3/s3-destination.js';
export type { S3BackupDestination, S3ProbeReport } from './s3/s3-destination.js';
export { S3_CREDENTIALS_PURPOSE, createS3CredentialStore, defaultS3CredentialStore, validateS3Credentials } from './s3/s3-credentials.js';
export type { S3CredentialStore } from './s3/s3-credentials.js';
export { DRIVE_CHUNK_BYTES, createDriveDestination } from './drive/drive-destination.js';
export type { DriveBackupDestination, DriveProbeReport } from './drive/drive-destination.js';
export { DRIVE_CREDENTIALS_PURPOSE, createDriveCredentialStore, defaultDriveCredentialStore, validateDriveClientSecret, validateDriveCredentials } from './drive/drive-credentials.js';
export type { DriveCredentialStore, DriveCredentials } from './drive/drive-credentials.js';
export { DRIVE_FILE_SCOPE, GOOGLE_DRIVE_ENDPOINTS, revokeDriveToken } from '../../hub/drive-oauth.js';
export type { DriveEndpoints, DriveFetch } from '../../hub/drive-oauth.js';
export { DRIVE_AUTHORIZATION_TTL_MS, createDriveAuthorizations, driveRedirectUri } from '../../hub/drive-authorization.js';
export type { DriveAuthorizations, DriveAuthorizationStatus, DriveCallbackOutcome } from '../../hub/drive-authorization.js';
export { ONEDRIVE_CHUNK_BYTES, createOneDriveDestination } from './onedrive/onedrive-destination.js';
export type { OneDriveBackupDestination, OneDriveProbeReport } from './onedrive/onedrive-destination.js';
export { ONEDRIVE_CREDENTIALS_PURPOSE, createOneDriveCredentialStore, defaultOneDriveCredentialStore, validateOneDriveClientSecret, validateOneDriveCredentials } from './onedrive/onedrive-credentials.js';
export type { OneDriveCredentialStore, OneDriveCredentials } from './onedrive/onedrive-credentials.js';
export { MICROSOFT_ONEDRIVE_ENDPOINTS, ONEDRIVE_SCOPE } from '../../hub/onedrive-oauth.js';
export type { OneDriveEndpoints, OneDriveFetch } from '../../hub/onedrive-oauth.js';
export { createOneDriveAuthorizations, onedriveRedirectUri } from '../../hub/onedrive-authorization.js';
export type { OneDriveAuthorizations } from '../../hub/onedrive-authorization.js';

export type OpenBackupDestination = (definition: HubBackupDestinationConfig) => BackupDestination;

export interface OpenBackupDestinationDeps {
  /** Where `s3` destinations read their credentials (default: the secret store under the paths). */
  s3Credentials?: S3CredentialStore;
  /** Test seams for the S3 destination (client transport and clock, part sizes). */
  s3?: Pick<S3DestinationOptions, 'client' | 'partBytes' | 'minPartBytes'>;
  /** Where `drive` destinations read their client secret and refresh token (default: the secret store under the paths). */
  driveCredentials?: DriveCredentialStore;
  /** Test seams for the Google Drive destination (a loopback fake's endpoints and fetch, the clock and backoff, the chunk size). */
  drive?: Pick<DriveDestinationOptions, 'client' | 'chunkBytes'>;
  /** Where `onedrive` destinations read their client secret and refresh token (default: the secret store under the paths). */
  onedriveCredentials?: OneDriveCredentialStore;
  /** Test seams for the OneDrive destination (a loopback fake's endpoints and fetch, the clock and backoff, the fragment size and the staging directory). */
  onedrive?: Pick<OneDriveDestinationOptions, 'client' | 'chunkBytes' | 'scratchDir'>;
}

export function isS3Definition(definition: HubBackupDestinationConfig): definition is HubBackupS3Destination {
  return definition.kind === 's3';
}

export function isDriveDefinition(definition: HubBackupDestinationConfig): definition is HubBackupDriveDestination {
  return definition.kind === 'drive';
}

export function isOneDriveDefinition(definition: HubBackupDestinationConfig): definition is HubBackupOneDriveDestination {
  return definition.kind === 'onedrive';
}

/** Where a OneDrive destination stages an object until its total size is known (inside the backups scratch area, away from every repository). */
export const oneDriveScratchDir = (paths: Pick<HubPaths, 'backupsDir'>): string => path.join(paths.backupsDir, '.tmp', 'onedrive');

/**
 * Builds the destination for a `hub.json` definition (the non-secret half; the S3 credentials are read from the secret store here,
 * never from the config). The location rules are enforced again at open time, so a hand-edited `hub.json` cannot point a run into
 * the data directory or at a link-local endpoint. A missing credential entry is `unavailable` (re-enter it with
 * `backup destination add`), never a request without credentials.
 */
export function openBackupDestination(definition: HubBackupDestinationConfig, paths: Pick<HubPaths, 'dataDir' | 'configDir' | 'tlsDir' | 'secretsDir' | 'storageDir'> & Partial<Pick<HubPaths, 'backupsDir'>>, platform: NodeJS.Platform = process.platform, deps: OpenBackupDestinationDeps = {}): BackupDestination {
  switch (definition.kind) {
    case 'local-folder':
      return createLocalFolderDestination({ id: definition.id, label: definition.label, folder: assertSafeLocalFolder(definition.folder, paths, platform) });
    case 's3': {
      let credentials;
      try {
        credentials = (deps.s3Credentials ?? defaultS3CredentialStore(paths)).get(definition.id);
      } catch {
        throw new DestinationError('unavailable', 'The stored S3 credentials are unreadable; add the S3 destination again with its credentials.');
      }
      if (credentials === null) throw new DestinationError('unavailable', 'No S3 credentials are stored for this destination; add it again with its credentials.');
      return createS3Destination({ definition, credentials, ...deps.s3 });
    }
    case 'drive': {
      let credentials;
      try {
        credentials = (deps.driveCredentials ?? defaultDriveCredentialStore(paths)).get(definition.id);
      } catch {
        throw new DestinationError('unavailable', 'The stored Google Drive authorization is unreadable; connect the Drive destination again.');
      }
      if (credentials === null) throw new DestinationError('unavailable', 'No Google Drive authorization is stored for this destination; connect it again (dude-hub backup destination add --kind drive).');
      return createDriveDestination({ definition, credentials, ...deps.drive });
    }
    case 'onedrive': {
      const store = deps.onedriveCredentials ?? defaultOneDriveCredentialStore(paths);
      let credentials;
      try {
        credentials = store.get(definition.id);
      } catch {
        throw new DestinationError('unavailable', 'The stored OneDrive authorization is unreadable; connect the OneDrive destination again.');
      }
      if (credentials === null) throw new DestinationError('unavailable', 'No OneDrive authorization is stored for this destination; connect it again (dude-hub backup destination add --kind onedrive).');
      // Microsoft rotates the refresh token on every refresh: the new one is stored (atomically, and only while the destination still has an entry) before the old one is dropped.
      const id = definition.id;
      return createOneDriveDestination({
        definition, credentials, scratchDir: paths.backupsDir !== undefined ? oneDriveScratchDir({ backupsDir: paths.backupsDir }) : path.join(tmpdir(), 'dude-hub-onedrive-stage'),
        onRefreshToken: (refreshToken) => { store.rotate(id, refreshToken); },
        latestRefreshToken: () => { try { return store.get(id)?.refreshToken; } catch { return undefined; } },
        ...deps.onedrive,
      });
    }
  }
}
