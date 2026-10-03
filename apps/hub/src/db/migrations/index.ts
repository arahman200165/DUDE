import type { Migration } from '@dude/sqlite-store';
import { migration0001 } from './0001-initial.js';
import { migration0002 } from './0002-owner-reset.js';
import { migration0003 } from './0003-sync.js';
import { migration0004 } from './0004-tls-sources.js';
import { migration0005 } from './0005-web-browsers.js';

export type { Migration };

/** Append only; never edit a shipped migration. */
export const HUB_MIGRATIONS: readonly Migration[] = [migration0001, migration0002, migration0003, migration0004, migration0005];
