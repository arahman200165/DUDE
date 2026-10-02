import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { NativeRecentsService } from '../native-recents/native-recents.service';
import { ScratchpadService } from '../workspace/scratchpad.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';

const seed = (key: string, value: unknown): void => localStorage.setItem(`dude:v1:${key}`, JSON.stringify(value));
const fresh = <T>(token: new () => T): T => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(token);
};

/** Non-journaled documents are decoded by their codec on load: garbage falls back to the defaults. */
describe('document codecs on load', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('workspace layout: garbage and unknown schemas reset to empty; a valid layout is kept', () => {
    seed('__workspace__:layout', 'garbage');
    expect(fresh(WorkspaceLayoutService).openTabs()).toEqual([]);

    seed('__workspace__:layout', { schemaVersion: 2, openTabs: ['json'], panelTree: null, focusedNodeId: null });
    expect(fresh(WorkspaceLayoutService).openTabs()).toEqual([]);

    seed('__workspace__:layout', { schemaVersion: 1, openTabs: ['base64', 7], panelTree: 'x', focusedNodeId: null });
    const service = fresh(WorkspaceLayoutService);
    expect(service.openTabs()).toEqual(['base64']);
    expect(service.panelTree()).toBeNull();
  });

  it('scratchpad: drops malformed snippets and resets garbage', () => {
    seed('__workspace__:scratchpad', { nope: true });
    expect(fresh(ScratchpadService).snippets()).toEqual([]);

    const snippet = { id: 's1', title: 't', body: 'b', createdAt: '2026-01-01T00:00:00.000Z' };
    seed('__workspace__:scratchpad', { schemaVersion: 1, snippets: [snippet, { id: 3 }, null], drawerExpanded: true });
    const service = fresh(ScratchpadService);
    expect(service.snippets()).toEqual([snippet]);
    expect(service.drawerExpanded()).toBe(true);
  });

  it('native recents: drops malformed entries and resets garbage', () => {
    seed('__native-recents__:entries', [1, 2, 3]);
    expect(fresh(NativeRecentsService).entries()).toEqual([]);

    const entry = { path: 'C:\a.json', name: 'a.json', extension: '.json', openedAt: '2026-01-01T00:00:00.000Z' };
    seed('__native-recents__:entries', { schemaVersion: 1, entries: [entry, { path: 1 }, 'x'] });
    expect(fresh(NativeRecentsService).entries()).toEqual([entry]);
  });
});
