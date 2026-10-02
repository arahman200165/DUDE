import { Component, computed, input } from '@angular/core';

/**
 * Reusable structural-diff renderer (PRD Section 13): a summary line plus a
 * per-path list of added/removed/changed entries. Structurally compatible
 * with `object-tree-diff.ts`'s `TreeDiffEntry`/`TreeDiffSummary` (used by
 * Advanced Diff's semantic mode) without importing across the tools/shared
 * boundary — any tool producing the same shape can pass its diff straight in.
 */
export type DiffOp = 'add' | 'remove' | 'replace';

export interface DiffEntry {
  readonly path: string;
  readonly op: DiffOp;
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

export interface DiffSummary {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
}

@Component({
  selector: 'app-diff-view',
  templateUrl: './diff-view.html',
})
export class DiffView {
  readonly entries = input.required<readonly DiffEntry[]>();
  readonly summary = input<DiffSummary | undefined>(undefined);

  protected readonly hasEntries = computed(() => this.entries().length > 0);

  /** Fixed-width gutter marker so add/remove/change reads without color: + added, − removed, ~ changed. */
  protected marker(op: DiffOp): string {
    return op === 'add' ? '+' : op === 'remove' ? '−' : '~';
  }

  protected formatValue(value: unknown): string {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }
}
