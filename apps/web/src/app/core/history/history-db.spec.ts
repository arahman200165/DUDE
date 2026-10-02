import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllEntries,
  countAll,
  countByTool,
  deleteAllByTool,
  deleteEntry,
  deleteOldestByTool,
  deleteOldestOverall,
  deleteOlderThan,
  getEntry,
  listByTool,
  listRecent,
  putEntry,
} from './history-db';
import { createHistoryEntry } from "@dude/domain/core/history/history.model";

function entry(toolId: string, summary: string, ageMs = 0) {
  const created = createHistoryEntry(toolId, summary, { note: summary });
  return { ...created, createdAt: new Date(Date.now() - ageMs).toISOString() };
}

describe('history-db', () => {
  beforeEach(async () => {
    await clearAllEntries();
  });

  it('puts and gets an entry by id', async () => {
    const e = entry('base64', 'first');
    await putEntry(e);
    expect(await getEntry(e.id)).toEqual(e);
  });

  it('returns undefined for a missing id', async () => {
    expect(await getEntry('missing')).toBeUndefined();
  });

  it('lists recent entries newest-first across all tools', async () => {
    const older = entry('base64', 'older', 2000);
    const newer = entry('json', 'newer', 0);
    await putEntry(older);
    await putEntry(newer);

    const recent = await listRecent(10);
    expect(recent.map((e) => e.summary)).toEqual(['newer', 'older']);
  });

  it('listByTool only returns that tool, newest-first', async () => {
    await putEntry(entry('base64', 'b-older', 2000));
    await putEntry(entry('base64', 'b-newer', 0));
    await putEntry(entry('json', 'j-only', 0));

    const results = await listByTool('base64', 10);
    expect(results.map((e) => e.summary)).toEqual(['b-newer', 'b-older']);
  });

  it('respects the limit parameter', async () => {
    await putEntry(entry('base64', 'a', 3000));
    await putEntry(entry('base64', 'b', 2000));
    await putEntry(entry('base64', 'c', 1000));

    expect(await listByTool('base64', 2)).toHaveLength(2);
    expect(await listRecent(2)).toHaveLength(2);
  });

  it('counts entries overall and per tool', async () => {
    await putEntry(entry('base64', 'a'));
    await putEntry(entry('base64', 'b'));
    await putEntry(entry('json', 'c'));

    expect(await countByTool('base64')).toBe(2);
    expect(await countByTool('json')).toBe(1);
    expect(await countAll()).toBe(3);
  });

  it('deletes a single entry', async () => {
    const e = entry('base64', 'a');
    await putEntry(e);
    await deleteEntry(e.id);
    expect(await getEntry(e.id)).toBeUndefined();
  });

  it('deleteOldestByTool removes only the oldest N for that tool', async () => {
    await putEntry(entry('base64', 'oldest', 3000));
    await putEntry(entry('base64', 'middle', 2000));
    await putEntry(entry('base64', 'newest', 1000));
    await putEntry(entry('json', 'untouched', 5000));

    await deleteOldestByTool('base64', 1);

    expect((await listByTool('base64', 10)).map((e) => e.summary)).toEqual(['newest', 'middle']);
    expect(await countByTool('json')).toBe(1);
  });

  it('deleteOldestOverall removes the globally oldest N regardless of tool', async () => {
    await putEntry(entry('base64', 'oldest', 3000));
    await putEntry(entry('json', 'newer', 1000));

    await deleteOldestOverall(1);

    expect(await countAll()).toBe(1);
    expect((await listRecent(10))[0].summary).toBe('newer');
  });

  it('deleteOlderThan removes only entries at or before the cutoff', async () => {
    await putEntry(entry('base64', 'old', 10000));
    await putEntry(entry('base64', 'new', 0));
    const cutoff = new Date(Date.now() - 5000).toISOString();

    await deleteOlderThan(cutoff);

    expect((await listRecent(10)).map((e) => e.summary)).toEqual(['new']);
  });

  it('deleteAllByTool clears one tool without touching others', async () => {
    await putEntry(entry('base64', 'a'));
    await putEntry(entry('json', 'b'));

    await deleteAllByTool('base64');

    expect(await countByTool('base64')).toBe(0);
    expect(await countByTool('json')).toBe(1);
  });

  it('clearAllEntries empties the store', async () => {
    await putEntry(entry('base64', 'a'));
    await putEntry(entry('json', 'b'));

    await clearAllEntries();

    expect(await countAll()).toBe(0);
  });
});
