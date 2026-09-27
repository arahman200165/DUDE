import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceLayoutService } from './workspace-layout.service';
import { findLeafByToolId } from './workspace.model';

describe('WorkspaceLayoutService', () => {
  let service: WorkspaceLayoutService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorkspaceLayoutService);
  });

  it('starts with no tabs and no panel tree', () => {
    expect(service.openTabs()).toEqual([]);
    expect(service.panelTree()).toBeNull();
    expect(service.focusedNodeId()).toBeNull();
  });

  it('opening the first tool creates the first leaf and focuses it', () => {
    service.openTool('base64');

    expect(service.openTabs()).toEqual(['base64']);
    const tree = service.panelTree();
    expect(tree).toEqual({ kind: 'leaf', nodeId: expect.any(String), toolId: 'base64' });
    expect(service.focusedNodeId()).toBe((tree as { nodeId: string }).nodeId);
    expect(service.focusedToolId()).toBe('base64');
  });

  it('opening a second tool swaps the focused leaf rather than creating a split', () => {
    service.openTool('base64');
    service.openTool('json');

    expect(service.openTabs()).toEqual(['base64', 'json']);
    expect(service.focusedToolId()).toBe('json');
    expect(findLeafByToolId(service.panelTree(), 'base64')).toBeNull();
  });

  it('re-opening an already-visible tool just focuses it, without altering the tree', () => {
    service.openTool('base64');
    service.splitFocused('json');
    const treeBefore = service.panelTree();

    service.openTool('base64');

    expect(service.openTabs()).toEqual(['base64', 'json']);
    expect(service.focusedToolId()).toBe('base64');
    expect(service.panelTree()).toEqual(treeBefore);
  });

  it('re-opening a swapped-out (not currently visible) tool swaps it back in', () => {
    service.openTool('base64');
    service.openTool('json');
    service.openTool('base64');

    expect(service.openTabs()).toEqual(['base64', 'json']);
    expect(service.focusedToolId()).toBe('base64');
    expect(findLeafByToolId(service.panelTree(), 'json')).toBeNull();
  });

  it('splitFocused wraps the focused leaf in a split with the new tool', () => {
    service.openTool('base64');
    service.splitFocused('json');

    expect(service.openTabs()).toEqual(['base64', 'json']);
    expect(findLeafByToolId(service.panelTree(), 'base64')).not.toBeNull();
    expect(findLeafByToolId(service.panelTree(), 'json')).not.toBeNull();
    expect(service.focusedToolId()).toBe('json');
  });

  it('closeTab removes the tab and collapses a split back to the sibling', () => {
    service.openTool('base64');
    service.splitFocused('json');
    service.closeTab('json');

    expect(service.openTabs()).toEqual(['base64']);
    expect(service.panelTree()).toEqual({ kind: 'leaf', nodeId: expect.any(String), toolId: 'base64' });
    expect(service.focusedToolId()).toBe('base64');
  });

  it('closeTab on the last tab empties the workspace', () => {
    service.openTool('base64');
    service.closeTab('base64');

    expect(service.openTabs()).toEqual([]);
    expect(service.panelTree()).toBeNull();
    expect(service.focusedNodeId()).toBeNull();
  });

  it('focusTab focuses an already-visible leaf without altering the tree', () => {
    service.openTool('base64');
    service.splitFocused('json');
    const treeBefore = service.panelTree();

    service.focusTab('base64');

    expect(service.focusedToolId()).toBe('base64');
    expect(service.panelTree()).toEqual(treeBefore);
  });

  it('reopenOnRestart defaults to true and does not affect the current session', () => {
    expect(service.reopenOnRestart()).toBe(true);
    service.openTool('base64');
    expect(service.openTabs()).toEqual(['base64']);
  });

  it('discards a leftover layout on a fresh bootstrap when reopenOnRestart is off', async () => {
    service.openTool('base64');
    service.reopenOnRestart.set(false);
    await TestBed.inject(ApplicationRef).whenStable();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(WorkspaceLayoutService);

    expect(fresh.openTabs()).toEqual([]);
    expect(fresh.panelTree()).toBeNull();
  });

  it('setSplitRatio updates only the targeted split node', () => {
    service.openTool('base64');
    service.splitFocused('json');
    const splitNodeId = service.panelTree()!.nodeId;

    service.setSplitRatio(splitNodeId, 0.3);

    expect((service.panelTree() as { ratio: number }).ratio).toBe(0.3);
  });
  it('silently prunes tabs/leaves for unregistered tools from a persisted layout on bootstrap', () => {
    localStorage.setItem(
      'dude:v1:__workspace__:layout',
      JSON.stringify({
        schemaVersion: 1,
        openTabs: ['base64', 'retired-tool'],
        panelTree: { kind: 'split', nodeId: 's', ratio: 0.5, a: { kind: 'leaf', nodeId: 'a', toolId: 'base64' }, b: { kind: 'leaf', nodeId: 'b', toolId: 'retired-tool' } },
        focusedNodeId: 'b',
      }),
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(WorkspaceLayoutService);

    expect(fresh.openTabs()).toEqual(['base64']);
    expect(fresh.panelTree()).toEqual({ kind: 'leaf', nodeId: 'a', toolId: 'base64' });
    expect(fresh.focusedToolId()).toBe('base64');
  });

  it('applyLayout replaces preference overrides wholesale and setPreferenceOverride sets/clears them', () => {
    service.setPreferenceOverride('markdown', 'relayUrl', ' ws://live ');
    expect(service.preferenceOverrides()).toEqual({ markdown: { relayUrl: 'ws://live' } });

    service.openTool('base64');
    expect(service.preferenceOverrides()).toEqual({ markdown: { relayUrl: 'ws://live' } });

    service.applyLayout(null, [], { markdown: { relayUrl: 'ws://template' } });
    expect(service.preferenceOverrides()).toEqual({ markdown: { relayUrl: 'ws://template' } });

    service.setPreferenceOverride('markdown', 'relayUrl', '');
    expect(service.preferenceOverrides()).toBeUndefined();

    service.setPreferenceOverride('markdown', 'relayUrl', 'ws://x');
    service.applyLayout(null, []);
    expect(service.preferenceOverrides()).toBeUndefined();
  });
});
