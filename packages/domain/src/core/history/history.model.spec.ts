import { describe, expect, it } from 'vitest';
import { HISTORY_ENTRY_SCHEMA_VERSION, createHistoryEntry, migrateHistoryEntry } from "./history.model.js";

describe('createHistoryEntry', () => {
  it('creates a well-formed entry with a fresh id and timestamp', () => {
    const entry = createHistoryEntry('base64', 'Encoding "hi"', { input: 'hi', mode: 'encode' });

    expect(entry.schemaVersion).toBe(HISTORY_ENTRY_SCHEMA_VERSION);
    expect(entry.toolId).toBe('base64');
    expect(entry.summary).toBe('Encoding "hi"');
    expect(entry.state).toEqual({ input: 'hi', mode: 'encode' });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(entry.createdAt).toString()).not.toBe('Invalid Date');
  });
});

describe('migrateHistoryEntry', () => {
  it('passes through a valid entry', () => {
    const entry = createHistoryEntry('hash', 'SHA-256 of "x"', { text: 'x' });
    expect(migrateHistoryEntry(entry)).toEqual(entry);
  });

  it('drops corrupt/unrecognized data rather than throwing', () => {
    expect(migrateHistoryEntry(null)).toBeUndefined();
    expect(migrateHistoryEntry('garbage')).toBeUndefined();
    expect(migrateHistoryEntry({ schemaVersion: 2 })).toBeUndefined();
    expect(migrateHistoryEntry({ schemaVersion: 1, id: '1' })).toBeUndefined();
  });
});
