/**
 * Recursive panel tree: a `leaf` hosts one tool (via `ToolHost`), a `split` renders two child
 * nodes side by side through the existing `SplitPane` (`shared/components/split-pane/`), reused
 * unmodified — horizontal only, matching every one of its 27+ existing call sites. Arbitrary depth
 * by construction — "split right" on any leaf just wraps it in a new `split` node. A vertical
 * split would need `SplitPane` itself extended with a direction input; deliberately out of scope
 * here (see `core/workspace/AGENTS.md`).
 */
export type PanelNode =
  | { readonly kind: 'leaf'; readonly nodeId: string; readonly toolId: string }
  | {
      readonly kind: 'split';
      readonly nodeId: string;
      readonly ratio: number;
      readonly a: PanelNode;
      readonly b: PanelNode;
    };

/**
 * Workspace-scoped overrides of tool preferences, keyed `toolId -> key -> value` — only keys a tool
 * declares via its manifest's `settingsSection.workspaceOverridable` are ever written (see
 * `workspace-preference.ts`). Optional on every layout-shaped record (live layout, templates,
 * projects), so older persisted data simply has none — no schema bump.
 */
export type PreferenceOverrides = Readonly<Record<string, Readonly<Record<string, string>>>>;

export interface WorkspaceLayout {
  readonly schemaVersion: 1;
  /** Every tool id ever opened this session, in open order — drives the tab strip, independent of
   *  which ones currently have a visible panel leaf (a tab can be "open" but swapped out). */
  readonly openTabs: readonly string[];
  readonly panelTree: PanelNode | null;
  readonly focusedNodeId: string | null;
  readonly preferenceOverrides?: PreferenceOverrides;
}

export const EMPTY_WORKSPACE_LAYOUT: WorkspaceLayout = {
  schemaVersion: 1,
  openTabs: [],
  panelTree: null,
  focusedNodeId: null,
};

/** Defensive parse: unknown/corrupt persisted data resets to an empty layout rather than throwing. */
export function migrateWorkspaceLayout(raw: unknown): WorkspaceLayout {
  if (!raw || typeof raw !== 'object') return EMPTY_WORKSPACE_LAYOUT;
  const candidate = raw as Partial<WorkspaceLayout>;
  if (candidate.schemaVersion === 1 && Array.isArray(candidate.openTabs)) {
    return {
      schemaVersion: 1,
      openTabs: candidate.openTabs,
      panelTree: candidate.panelTree ?? null,
      focusedNodeId: candidate.focusedNodeId ?? null,
      ...withPreferenceOverrides(sanitizePreferenceOverrides(candidate.preferenceOverrides)),
    };
  }
  return EMPTY_WORKSPACE_LAYOUT;
}

/** Keeps only well-formed `string -> string -> string` entries; `undefined` when nothing survives. */
export function sanitizePreferenceOverrides(raw: unknown): PreferenceOverrides | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, Record<string, string>> = {};
  for (const [toolId, entries] of Object.entries(raw)) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
    const kept = Object.entries(entries).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    if (kept.length) result[toolId] = Object.fromEntries(kept);
  }
  return Object.keys(result).length ? result : undefined;
}

/** Spread helper so an absent/empty override map never materializes as an explicit `undefined` key. */
export function withPreferenceOverrides(overrides: PreferenceOverrides | undefined): { preferenceOverrides?: PreferenceOverrides } {
  return overrides ? { preferenceOverrides: overrides } : {};
}

/** Sets (or, with `null`/empty, clears) one override, dropping a tool's entry once it has none left. */
export function setPreferenceOverride(
  overrides: PreferenceOverrides | undefined,
  toolId: string,
  key: string,
  value: string | null,
): PreferenceOverrides | undefined {
  const toolEntries: Record<string, string> = { ...overrides?.[toolId] };
  if (value) toolEntries[key] = value;
  else delete toolEntries[key];

  const next: Record<string, Readonly<Record<string, string>>> = { ...overrides };
  if (Object.keys(toolEntries).length) next[toolId] = toolEntries;
  else delete next[toolId];
  return sanitizePreferenceOverrides(next);
}

/**
 * Drops every leaf whose tool no longer exists (a split that loses one side collapses to the
 * survivor). Returns the same reference when nothing was pruned.
 */
export function prunePanelTree(node: PanelNode | null, isKnownTool: (toolId: string) => boolean): PanelNode | null {
  if (!node) return null;
  if (node.kind === 'leaf') return isKnownTool(node.toolId) ? node : null;
  const a = prunePanelTree(node.a, isKnownTool);
  const b = prunePanelTree(node.b, isKnownTool);
  if (a && b) return a === node.a && b === node.b ? node : { ...node, a, b };
  return a ?? b;
}

/**
 * Silently removes tabs/leaves referencing tool ids that aren't registered any more (e.g. a tool
 * that was retired or became a shell destination). Returns `layout` itself when nothing changed.
 */
export function pruneUnknownTools(layout: WorkspaceLayout, isKnownTool: (toolId: string) => boolean): WorkspaceLayout {
  const panelTree = prunePanelTree(layout.panelTree, isKnownTool);
  const openTabs = layout.openTabs.filter(isKnownTool);
  if (panelTree === layout.panelTree && openTabs.length === layout.openTabs.length) return layout;
  const focusedNodeId =
    layout.focusedNodeId && findNodeById(panelTree, layout.focusedNodeId) ? layout.focusedNodeId : (findFirstLeaf(panelTree)?.nodeId ?? null);
  return { ...layout, openTabs, panelTree, focusedNodeId };
}

type LeafNode = Extract<PanelNode, { kind: 'leaf' }>;

export function findLeafByToolId(node: PanelNode | null, toolId: string): LeafNode | null {
  if (!node) return null;
  if (node.kind === 'leaf') return node.toolId === toolId ? node : null;
  return findLeafByToolId(node.a, toolId) ?? findLeafByToolId(node.b, toolId);
}

export function findNodeById(node: PanelNode | null, nodeId: string): PanelNode | null {
  if (!node) return null;
  if (node.nodeId === nodeId) return node;
  if (node.kind === 'leaf') return null;
  return findNodeById(node.a, nodeId) ?? findNodeById(node.b, nodeId);
}

export function findFirstLeaf(node: PanelNode | null): LeafNode | null {
  if (!node) return null;
  if (node.kind === 'leaf') return node;
  return findFirstLeaf(node.a) ?? findFirstLeaf(node.b);
}

/** Replaces the node with id `nodeId` with `replacement`, wherever it sits in the tree. */
export function replaceNode(node: PanelNode, nodeId: string, replacement: PanelNode): PanelNode {
  if (node.nodeId === nodeId) return replacement;
  if (node.kind === 'leaf') return node;
  return { ...node, a: replaceNode(node.a, nodeId, replacement), b: replaceNode(node.b, nodeId, replacement) };
}

/**
 * Removes the leaf with id `nodeId`. If it's a direct child of a split, the sibling subtree takes
 * the split's place. Returns `null` only when the whole tree was that one leaf.
 */
export function removeLeafById(node: PanelNode | null, nodeId: string): PanelNode | null {
  if (!node) return null;
  if (node.kind === 'leaf') return node.nodeId === nodeId ? null : node;

  if (node.a.kind === 'leaf' && node.a.nodeId === nodeId) return node.b;
  if (node.b.kind === 'leaf' && node.b.nodeId === nodeId) return node.a;

  return { ...node, a: removeLeafById(node.a, nodeId) ?? node.a, b: removeLeafById(node.b, nodeId) ?? node.b };
}
