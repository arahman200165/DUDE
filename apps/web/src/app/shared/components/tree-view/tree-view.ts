import type { TreeNode } from "@dude/domain/shared/models/tree-node.model";
export type { TreeNode } from "@dude/domain/shared/models/tree-node.model";
import { Component, forwardRef, input, signal } from '@angular/core';

/**
 * Reusable recursive collapsible tree renderer (PRD Section 4.3: dense over
 * decorative — no per-type color invention, just the shared palette).
 * Presentational only; a consuming tool owns node construction and labeling.
 */
@Component({
  selector: 'app-tree-view',
  imports: [forwardRef(() => TreeView)],
  templateUrl: './tree-view.html',
})
export class TreeView {
  readonly nodes = input.required<readonly TreeNode[]>();

  private readonly collapsedSignal = signal<ReadonlySet<string>>(new Set());

  protected isExpanded(node: TreeNode): boolean {
    return !!node.children && !this.collapsedSignal().has(node.path);
  }

  protected toggle(node: TreeNode): void {
    const next = new Set(this.collapsedSignal());
    if (next.has(node.path)) next.delete(node.path);
    else next.add(node.path);
    this.collapsedSignal.set(next);
  }
}
