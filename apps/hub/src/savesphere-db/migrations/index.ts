import type { Migration } from '@dude/sqlite-store';
import { saveSphereMigration0001 } from './0001-platform.js';
import { saveSphereMigration0002 } from './0002-blobs.js';

/** The `savesphere.db` sequence. Append only; never edit a shipped migration. Independent of `HUB_MIGRATIONS`. */
export const SAVESPHERE_MIGRATIONS: readonly Migration[] = [saveSphereMigration0001, saveSphereMigration0002];
