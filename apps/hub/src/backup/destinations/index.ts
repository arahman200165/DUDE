import type { HubPaths } from '../../config/data-dir.js';
import type { HubBackupDestinationConfig, HubBackupS3Destination } from '../../config/hub-config.js';
import type { BackupDestination } from './destination.js';
import { DestinationError } from './destination.js';
import { assertSafeLocalFolder, createLocalFolderDestination } from './local-folder.js';
import { createS3Destination } from './s3/s3-destination.js';
import type { S3DestinationOptions } from './s3/s3-destination.js';
import { defaultS3CredentialStore } from './s3/s3-credentials.js';
import type { S3CredentialStore } from './s3/s3-credentials.js';

export * from './destination.js';
export { assertSafeLocalFolder, createLocalFolderDestination, isInsideFolder } from './local-folder.js';
export { createS3Destination, S3_PART_BYTES } from './s3/s3-destination.js';
export type { S3BackupDestination, S3ProbeReport } from './s3/s3-destination.js';
export { S3_CREDENTIALS_PURPOSE, createS3CredentialStore, defaultS3CredentialStore, validateS3Credentials } from './s3/s3-credentials.js';
export type { S3CredentialStore } from './s3/s3-credentials.js';

export type OpenBackupDestination = (definition: HubBackupDestinationConfig) => BackupDestination;

export interface OpenBackupDestinationDeps {
  /** Where `s3` destinations read their credentials (default: the secret store under the paths). */
  s3Credentials?: S3CredentialStore;
  /** Test seams for the S3 destination (client transport and clock, part sizes). */
  s3?: Pick<S3DestinationOptions, 'client' | 'partBytes' | 'minPartBytes'>;
}

export function isS3Definition(definition: HubBackupDestinationConfig): definition is HubBackupS3Destination {
  return definition.kind === 's3';
}

/**
 * Builds the destination for a `hub.json` definition (the non-secret half; the S3 credentials are read from the secret store here,
 * never from the config). The location rules are enforced again at open time, so a hand-edited `hub.json` cannot point a run into
 * the data directory or at a link-local endpoint. A missing credential entry is `unavailable` (re-enter it with
 * `backup destination add`), never a request without credentials.
 */
export function openBackupDestination(definition: HubBackupDestinationConfig, paths: Pick<HubPaths, 'dataDir' | 'configDir' | 'tlsDir' | 'secretsDir' | 'storageDir'>, platform: NodeJS.Platform = process.platform, deps: OpenBackupDestinationDeps = {}): BackupDestination {
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
  }
}
