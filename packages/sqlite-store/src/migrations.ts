import { createHash } from 'node:crypto';

export interface Migration {
  version: number;
  name: string;
  /** Oldest reader version that can still read the store after this step. */
  minReaderVersion: number;
  sql: string;
}

export const checksumOf = (migration: Migration): string => createHash('sha256').update(migration.sql).digest('hex');

export const latestVersion = (migrations: readonly Migration[]): number => migrations.reduce((m, x) => Math.max(m, x.version), 0);
