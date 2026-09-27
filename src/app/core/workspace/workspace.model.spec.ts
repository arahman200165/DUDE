import { describe, expect, it } from 'vitest';
import {
  EMPTY_WORKSPACE_LAYOUT,
  PanelNode,
  findFirstLeaf,
  findLeafByToolId,
  findNodeById,
  migrateWorkspaceLayout,
  prunePanelTree,
  pruneUnknownTools,
  removeLeafById,
  replaceNode,
  sanitizePreferenceOverrides,
  setPreferenceOverride,
} from './workspace.model';

const leaf = (nodeId: string, toolId: string): PanelNode => ({ kind: 'leaf', nodeId, toolId });
const split = (nodeId: string, a: PanelNode, b: PanelNode): PanelNode => ({
  kind: 'split',
  nodeId,
  ratio: 0.5,
  a,
  b,
});

describe('migrateWorkspaceLayout', () => {
  it('resets to empty for corrupt/unrecognized data', () => {
    expect(migrateWorkspaceLayout(null)).toEqual(EMPTY_WORKSPACE_LAYOUT);
    expect(migrateWorkspaceLayout({ schemaVersion: 2 })).toEqual(EMPTY_WORKSPACE_LAYOUT);
    expect(migrateWorkspaceLayout('garbage')).toEqual(EMPTY_WORKSPACE_LAYOUT);
  });

  it('passes through a valid layout', () => {
    const layout = { schemaVersion: 1 as const, openTabs: ['base64'], panelTree: leaf('n1', 'base64'), focusedNodeId: 'n1' };
    expect(migrateWorkspaceLayout(layout)).toEqual(layout);
  });

  it('passes through well-formed preference overrides and drops malformed ones', () => {
    const base = { schemaVersion: 1 as const, openTabs: [], panelTree: null, focusedNodeId: null };
    expect(migrateWorkspaceLayout({ ...base, preferenceOverrides: { tool: { key: 'v' } } }).preferenceOverrides).toEqual({ tool: { key: 'v' } });
    expect(migrateWorkspaceLayout({ ...base, preferenceOverrides: { tool: { key: 4 } } })).toEqual(base);
    expect(migrateWorkspaceLayout({ ...base, preferenceOverrides: 'garbage' })).toEqual(base);
  });
});

describe('preference overrides', () => {
  it('sanitize keeps only string -> string -> string entries', () => {
    expect(sanitizePreferenceOverrides({ a: { k: 'v', bad: 1 }, b: [], c: null })).toEqual({ a: { k: 'v' } });
    expect(sanitizePreferenceOverrides({})).toBeUndefined();
    expect(sanitizePreferenceOverrides([])).toBeUndefined();
  });

  it('setPreferenceOverride adds, replaces, and clears, dropping empty tool entries', () => {
    const one = setPreferenceOverride(undefined, 'tool', 'relayUrl', 'ws://a');
    expect(one).toEqual({ tool: { relayUrl: 'ws://a' } });
    const two = setPreferenceOverride(one, 'other', 'k', 'v');
    expect(two).toEqual({ tool: { relayUrl: 'ws://a' }, other: { k: 'v' } });
    expect(setPreferenceOverride(two, 'tool', 'relayUrl', null)).toEqual({ other: { k: 'v' } });
    expect(setPreferenceOverride(one, 'tool', 'relayUrl', null)).toBeUndefined();
  });
});

describe('pruning unknown tools', () => {
  const known = (toolId: string): boolean => toolId !== 'settings';

  it('prunePanelTree collapses a split that loses one side and keeps the reference when nothing changes', () => {
    const tree = split('root', leaf('a', 'base64'), split('right', leaf('b', 'settings'), leaf('c', 'json')));
    expect(prunePanelTree(tree, known)).toEqual(split('root', leaf('a', 'base64'), leaf('c', 'json')));
    const clean = split('root', leaf('a', 'base64'), leaf('c', 'json'));
    expect(prunePanelTree(clean, known)).toBe(clean);
    expect(prunePanelTree(leaf('b', 'settings'), known)).toBeNull();
  });

  it('pruneUnknownTools drops stale tabs and refocuses when the focused leaf was pruned', () => {
    const layout = {
      schemaVersion: 1 as const,
      openTabs: ['base64', 'settings'],
      panelTree: split('root', leaf('a', 'base64'), leaf('b', 'settings')),
      focusedNodeId: 'b',
    };
    expect(pruneUnknownTools(layout, known)).toEqual({ ...layout, openTabs: ['base64'], panelTree: leaf('a', 'base64'), focusedNodeId: 'a' });
    const clean = { ...layout, openTabs: ['base64'], panelTree: leaf('a', 'base64'), focusedNodeId: 'a' };
    expect(pruneUnknownTools(clean, known)).toBe(clean);
  });
});

describe('tree helpers', () => {
  const tree = split('root', leaf('a', 'base64'), leaf('b', 'json'));

  it('findLeafByToolId finds a leaf anywhere in the tree', () => {
    expect(findLeafByToolId(tree, 'json')).toEqual(leaf('b', 'json'));
    expect(findLeafByToolId(tree, 'missing')).toBeNull();
    expect(findLeafByToolId(null, 'anything')).toBeNull();
  });

  it('findNodeById finds a split or a leaf by id', () => {
    expect(findNodeById(tree, 'root')).toEqual(tree);
    expect(findNodeById(tree, 'a')).toEqual(leaf('a', 'base64'));
    expect(findNodeById(tree, 'missing')).toBeNull();
  });

  it('findFirstLeaf walks to the leftmost leaf', () => {
    expect(findFirstLeaf(tree)).toEqual(leaf('a', 'base64'));
    expect(findFirstLeaf(null)).toBeNull();
  });

  it('replaceNode swaps a leaf in place', () => {
    const updated = replaceNode(tree, 'a', leaf('a', 'hash'));
    expect(findLeafByToolId(updated, 'hash')).toEqual(leaf('a', 'hash'));
    expect(findLeafByToolId(updated, 'base64')).toBeNull();
  });

  it('removeLeafById collapses a split into its sibling when a direct child leaf is removed', () => {
    expect(removeLeafById(tree, 'a')).toEqual(leaf('b', 'json'));
    expect(removeLeafById(tree, 'b')).toEqual(leaf('a', 'base64'));
  });

  it('removeLeafById returns null when the whole tree is the removed leaf', () => {
    expect(removeLeafById(leaf('only', 'base64'), 'only')).toBeNull();
  });

  it('removeLeafById recurses into nested splits without collapsing the wrong level', () => {
    const nested = split('root', split('inner', leaf('a', 'base64'), leaf('b', 'json')), leaf('c', 'hash'));
    const updated = removeLeafById(nested, 'a');
    expect(updated).toEqual(split('root', leaf('b', 'json'), leaf('c', 'hash')));
  });
});
