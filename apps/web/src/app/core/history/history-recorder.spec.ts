import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordHistoryOnDestroy } from './history-recorder';
import { HistoryService } from './history.service';
import { clearAllEntries } from './history-db';

describe('recordHistoryOnDestroy', () => {
  let history: HistoryService;

  beforeEach(async () => {
    await clearAllEntries();
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    history = TestBed.inject(HistoryService);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('records an entry for a history-eligible tool with content', async () => {
    sessionStorage.setItem('dude:v1:base64:input', JSON.stringify('hello'));
    await recordHistoryOnDestroy('base64', history);

    expect(await history.listByTool('base64')).toHaveLength(1);
  });

  it('does nothing for a tool with no workspace-step adapter', async () => {
    await recordHistoryOnDestroy('this-tool-does-not-exist', history);
    expect(await history.listByTool('this-tool-does-not-exist')).toEqual([]);
  });

  it('does nothing for a workspace-eligible but history-ineligible tool', async () => {
    await recordHistoryOnDestroy('jwt', history);
    expect(await history.listByTool('jwt')).toEqual([]);
  });

  it('does nothing when there is nothing to snapshot', async () => {
    await recordHistoryOnDestroy('base64', history);
    expect(await history.listByTool('base64')).toEqual([]);
  });
});
