import { hostCrypto } from "@dude/crypto/host";
export const HISTORY_ENTRY_SCHEMA_VERSION = 1;

export interface HistoryEntry {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly toolId: string;
  readonly createdAt: string;
  readonly summary: string;
  readonly state: Readonly<Record<string, unknown>>;
  /** Set when `state` was size-capped before storing (§29 "fail clearly") — see history.service.ts. */
  readonly truncated?: boolean;
}

// Per-tool/global/age retention (§29 "fail clearly if a browser/library limit is reached").
export const MAX_ENTRIES_PER_TOOL = 200;
export const MAX_TOTAL_ENTRIES = 5000;
export const MAX_ENTRY_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_ENTRY_SIZE_BYTES = 256 * 1024;

export function createHistoryEntry(toolId: string, summary: string, state: Readonly<Record<string, unknown>>): HistoryEntry {
  return { id: hostCrypto().randomUUID(), schemaVersion: HISTORY_ENTRY_SCHEMA_VERSION, toolId, createdAt: new Date().toISOString(), summary, state };
}

/** Defensive parse: an unrecognized/corrupt record is dropped rather than thrown on. */
export function migrateHistoryEntry(raw: unknown): HistoryEntry | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as Partial<HistoryEntry>;
  if (
    candidate.schemaVersion === HISTORY_ENTRY_SCHEMA_VERSION &&
    typeof candidate.id === 'string' &&
    typeof candidate.toolId === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.summary === 'string'
  ) {
    return candidate as HistoryEntry;
  }
  return undefined;
}
