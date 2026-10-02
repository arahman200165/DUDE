import { Injectable, computed, inject, signal } from '@angular/core';
import { workspaceLayoutCodec } from '@dude/persistence';
import { PersistenceService } from '../persistence/persistence.service';
import { createStorageBackend } from '../persistence/storage-backend';
import { buildStorageKey } from "@dude/tool-engine/core/persistence/persistence-keys";
import { ToolRegistryService } from '../registry/tool-registry.service';
import {
  EMPTY_WORKSPACE_LAYOUT,
  PanelNode,
  PreferenceOverrides,
  WorkspaceLayout,
  findFirstLeaf,
  findLeafByToolId,
  findNodeById,
  pruneUnknownTools,
  removeLeafById,
  replaceNode,
  sanitizePreferenceOverrides,
  setPreferenceOverride,
  withPreferenceOverrides,
} from "@dude/domain/core/workspace/workspace.model";

/**
 * Which tools are open, and how they're arranged into tabs/panels — "layout preference" per
 * DUDE_PRD.md §14.1, so it persists unconditionally under `'__workspace__'`, the same synthetic
 * pseudo-toolId trick `core/pipeline/pipeline-store.service.ts` uses for `'__pipelines__'`. Holds
 * zero tool payload: only tool ids and split ratios, never a tool's actual input/output.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceLayoutService {
  private readonly persistence = inject(PersistenceService);
  private readonly registry = inject(ToolRegistryService);
  private readonly isKnownTool = (toolId: string): boolean => this.registry.getById(toolId) !== undefined;
  private readonly layout = this.persistence.signal<WorkspaceLayout>(
    '__workspace__',
    'layout',
    'local',
    EMPTY_WORKSPACE_LAYOUT,
    { crossTab: 'notify', decode: (raw) => workspaceLayoutCodec.decode(raw) },
  );

  /**
   * Multi-tab coherence (Phase 26 Item 14). Each tab owns its layout, so another tab's layout
   * write is never adopted silently. It raises `changedInAnotherTab` so the Workspace can offer
   * "use that layout / keep mine" instead of the last writer quietly winning.
   */
  private readonly externalChanges = this.persistence.externalChanges('__workspace__', 'layout');
  private readonly acknowledgedChanges = signal(0);
  readonly changedInAnotherTab = computed(() => this.externalChanges() > this.acknowledgedChanges());

  /** Adopts the layout another tab just saved. */
  adoptOtherTabLayout(): void {
    const raw = createStorageBackend('local').get(buildStorageKey('__workspace__', 'layout'));
    if (raw !== null) {
      try {
        this.layout.set(pruneUnknownTools(workspaceLayoutCodec.decode(JSON.parse(raw)) ?? EMPTY_WORKSPACE_LAYOUT, this.isKnownTool));
      } catch {
        // Unreadable: keep this tab's layout.
      }
    }
    this.acknowledgedChanges.set(this.externalChanges());
  }

  /** Keeps this tab's layout and re-saves it, so storage matches what this tab shows. */
  keepThisTabLayout(): void {
    this.layout.set({ ...this.layout() });
    this.acknowledgedChanges.set(this.externalChanges());
  }

  /**
   * "Reopen my tabs on restart" (Milestone 294) — a plain UI preference (`local`-policy, on by
   * default), not a sensitivity gate: the layout store itself is always `local`-policy layout
   * metadata regardless (§14.1's "layout preference" example), so this only controls whether a
   * *fresh app bootstrap* discards a leftover layout rather than restoring it. It has no effect
   * within a single already-running session.
   */
  readonly reopenOnRestart = this.persistence.signal('__workspace__', 'reopenOnRestart', 'local', true);

  constructor() {
    const pruned = pruneUnknownTools(this.layout(), this.isKnownTool);
    const layout = this.reopenOnRestart() ? pruned : EMPTY_WORKSPACE_LAYOUT;
    if (layout !== this.layout()) this.layout.set(layout);
  }

  readonly openTabs = computed(() => this.layout().openTabs);
  readonly panelTree = computed(() => this.layout().panelTree);
  readonly focusedNodeId = computed(() => this.layout().focusedNodeId);
  readonly preferenceOverrides = computed<PreferenceOverrides | undefined>(() => this.layout().preferenceOverrides);

  /** The tool id shown by the currently-focused leaf, if any — drives the tab strip's active state. */
  readonly focusedToolId = computed(() => {
    const nodeId = this.focusedNodeId();
    if (!nodeId) return null;
    const node = findNodeById(this.panelTree(), nodeId);
    return node?.kind === 'leaf' ? node.toolId : null;
  });

  /**
   * Opens `toolId`. If it already has a visible leaf, that leaf is simply focused. Otherwise it's
   * placed into the focused leaf, replacing whatever tool was showing there (browser-tab-style
   * swap) — or becomes the first leaf if no panel exists yet. Deliberately one leaf per tool id
   * (see `core/workspace/AGENTS.md`'s documented v1 limit): opening an already-open tool never
   * duplicates it.
   */
  openTool(toolId: string): void {
    const current = this.layout();
    const existingLeaf = findLeafByToolId(current.panelTree, toolId);
    if (existingLeaf) {
      this.layout.set({ ...current, focusedNodeId: existingLeaf.nodeId });
      return;
    }

    const openTabs = current.openTabs.includes(toolId) ? current.openTabs : [...current.openTabs, toolId];

    if (!current.panelTree) {
      const leaf: PanelNode = { kind: 'leaf', nodeId: crypto.randomUUID(), toolId };
      this.layout.set({ ...current, openTabs, panelTree: leaf, focusedNodeId: leaf.nodeId });
      return;
    }

    const focusedNodeId = current.focusedNodeId ?? findFirstLeaf(current.panelTree)?.nodeId ?? null;
    if (!focusedNodeId) {
      this.layout.set({ ...current, openTabs });
      return;
    }

    const panelTree = replaceNode(current.panelTree, focusedNodeId, { kind: 'leaf', nodeId: focusedNodeId, toolId });
    this.layout.set({ ...current, openTabs, panelTree, focusedNodeId });
  }

  /** Focuses `toolId`'s leaf if it currently has one visible; a no-op otherwise. */
  focusTab(toolId: string): void {
    const current = this.layout();
    const leaf = findLeafByToolId(current.panelTree, toolId);
    if (leaf) this.layout.set({ ...current, focusedNodeId: leaf.nodeId });
  }

  /** Closes `toolId` entirely — removes it from the tab strip and, if visible, its panel leaf. */
  closeTab(toolId: string): void {
    const current = this.layout();
    const leaf = findLeafByToolId(current.panelTree, toolId);
    const openTabs = current.openTabs.filter((id) => id !== toolId);

    if (!leaf) {
      this.layout.set({ ...current, openTabs });
      return;
    }

    const panelTree = removeLeafById(current.panelTree, leaf.nodeId);
    const focusedNodeId = current.focusedNodeId === leaf.nodeId ? (findFirstLeaf(panelTree)?.nodeId ?? null) : current.focusedNodeId;
    this.layout.set({ ...current, openTabs, panelTree, focusedNodeId });
  }

  /** Turns the currently-focused leaf into a horizontal split, adding `toolId` as the new pane. */
  splitFocused(toolId: string): void {
    const current = this.layout();
    const focusedLeaf = current.focusedNodeId ? findNodeById(current.panelTree, current.focusedNodeId) : null;

    if (!current.panelTree || !focusedLeaf || focusedLeaf.kind !== 'leaf') {
      this.openTool(toolId);
      return;
    }

    const openTabs = current.openTabs.includes(toolId) ? current.openTabs : [...current.openTabs, toolId];
    const newLeaf: PanelNode = { kind: 'leaf', nodeId: crypto.randomUUID(), toolId };
    const splitNode: PanelNode = {
      kind: 'split',
      nodeId: crypto.randomUUID(),
      ratio: 0.5,
      a: focusedLeaf,
      b: newLeaf,
    };

    const panelTree = replaceNode(current.panelTree, focusedLeaf.nodeId, splitNode);
    this.layout.set({ ...current, openTabs, panelTree, focusedNodeId: newLeaf.nodeId });
  }

  /**
   * Replaces the entire layout wholesale -- the one setter Workspace Templates (Phase 24 Item 11)
   * applies through, so a template can never desync from the invariants already enforced here (one
   * leaf per tool id is the template author's own responsibility; this does no further validation,
   * exactly like `openTool`'s own trust of its caller). Tabs/leaves naming tools that no longer
   * exist are silently pruned, and the saved record's preference overrides (if any) replace the
   * live ones wholesale.
   */
  applyLayout(panelTree: PanelNode | null, openTabs: readonly string[], preferenceOverrides?: PreferenceOverrides): void {
    const layout: WorkspaceLayout = {
      schemaVersion: 1,
      openTabs,
      panelTree,
      focusedNodeId: null,
      ...withPreferenceOverrides(sanitizePreferenceOverrides(preferenceOverrides)),
    };
    this.layout.set(pruneUnknownTools(layout, this.isKnownTool));
  }

  /** Sets (or with `null`/`''` clears back to the global value) one workspace-scoped preference override. */
  setPreferenceOverride(toolId: string, key: string, value: string | null): void {
    const { preferenceOverrides, ...current } = this.layout();
    const next = setPreferenceOverride(preferenceOverrides, toolId, key, value?.trim() || null);
    this.layout.set({ ...current, ...withPreferenceOverrides(next) });
  }

  /** Persists a drag-resize on the split with id `nodeId`. */
  setSplitRatio(nodeId: string, ratio: number): void {
    const current = this.layout();
    if (!current.panelTree) return;

    const node = findNodeById(current.panelTree, nodeId);
    if (!node || node.kind !== 'split') return;

    const panelTree = replaceNode(current.panelTree, nodeId, { ...node, ratio });
    this.layout.set({ ...current, panelTree });
  }
}
