import type { Migration } from '@dude/sqlite-store';
import { migration0001 } from './0001-initial.js';
import { migration0002 } from './0002-owner-reset.js';

export type { Migration };

/** Append only; never edit a shipped migration. */
export const HUB_MIGRATIONS: readonly Migration[] = [migration0001, migration0002];
