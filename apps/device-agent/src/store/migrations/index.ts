import { createHash } from 'node:crypto';
import { migration0001 } from './0001-initial.js';

export interface Migration {
  version: number;
  name: string;
  /** Oldest reader version that can still read the store after this step. */
  minReaderVersion: number;
  sql: string;
}

export const checksumOf = (migration: Migration): string => createHash('sha256').update(migration.sql).digest('hex');

/** Append only; never edit a shipped migration. */
export const MIGRATIONS: readonly Migration[] = [migration0001];

export const latestVersion = (migrations: readonly Migration[]): number => migrations.reduce((m, x) => Math.max(m, x.version), 0);
