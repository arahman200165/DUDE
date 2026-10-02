import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { HistoryHandoffService } from './history-handoff.service';
import { HistoryService } from './history.service';
import { clearAllEntries } from './history-db';
import { routes } from '../routing/app.routes';

describe('HistoryHandoffService', () => {
  let handoff: HistoryHandoffService;
  let history: HistoryService;

  beforeEach(async () => {
    await clearAllEntries();
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    handoff = TestBed.inject(HistoryHandoffService);
    history = TestBed.inject(HistoryService);
  });

  it('returns false for a missing entry', async () => {
    expect(await handoff.open('missing')).toBe(false);
  });

  it('restores a storage-backed tool state before navigating', async () => {
    await history.record('base64', 'test', { input: 'restored value', mode: 'decode' });
    const [entry] = await history.listByTool('base64');

    expect(await handoff.open(entry.id)).toBe(true);
    expect(sessionStorage.getItem('dude:v1:base64:input')).toBe('"restored value"');
    expect(localStorage.getItem('dude:v1:base64:mode')).toBe('"decode"');
  });

  it('returns false for an entry whose tool no longer exists in the registry', async () => {
    await history.record('base64', 'test', { input: 'x' });
    const [entry] = await history.listByTool('base64');
    await history.deleteOne(entry.id);

    // Re-record under a fabricated, non-existent tool id to exercise the "tool not found" branch.
    await history.record('__no-such-tool__', 'test', { input: 'x' });
    const [fake] = await history.listByTool('__no-such-tool__');

    expect(await handoff.open(fake.id)).toBe(false);
  });
});
