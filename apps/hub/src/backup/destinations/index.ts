import type { HubPaths } from '../../config/data-dir.js';
import type { HubBackupDestinationConfig } from '../../config/hub-config.js';
import type { BackupDestination } from './destination.js';
import { assertSafeLocalFolder, createLocalFolderDestination } from './local-folder.js';

export * from './destination.js';
export { assertSafeLocalFolder, createLocalFolderDestination, isInsideFolder } from './local-folder.js';

export type OpenBackupDestination = (definition: HubBackupDestinationConfig) => BackupDestination;

/**
 * Builds the destination for a `hub.json` definition (the non-secret half; a later kind reads its credential from the secret store
 * here, never from the config). The location rules are enforced again at open time, so a hand-edited `hub.json` cannot point a
 * run into the data directory. Milestone 848 adds `s3` beside `local-folder`.
 */
export function openBackupDestination(definition: HubBackupDestinationConfig, paths: Pick<HubPaths, 'dataDir' | 'configDir' | 'tlsDir' | 'secretsDir' | 'storageDir'>, platform: NodeJS.Platform = process.platform): BackupDestination {
  switch (definition.kind) {
    case 'local-folder':
      return createLocalFolderDestination({ id: definition.id, label: definition.label, folder: assertSafeLocalFolder(definition.folder, paths, platform) });
  }
}
