import type { Migration } from '@dude/sqlite-store';
import { saveSphereMigration0001 } from './0001-platform.js';
import { saveSphereMigration0002 } from './0002-blobs.js';
import { saveSphereMigration0003 } from './0003-queue.js';
import { saveSphereMigration0004 } from './0004-ingest-tokens.js';

/** The `savesphere.db` sequence. Append only; never edit a shipped migration. Independent of `HUB_MIGRATIONS`. */
export const SAVESPHERE_MIGRATIONS: readonly Migration[] = [saveSphereMigration0001, saveSphereMigration0002, saveSphereMigration0003, saveSphereMigration0004];
