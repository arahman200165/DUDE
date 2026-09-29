import type { ProcessSummary } from './system-types';
import { processKey } from './cpu-delta';

export interface ProcessNode {
  readonly process: ProcessSummary;
  readonly key: string;
  readonly depth: number;
  readonly children: readonly ProcessNode[];
}

export interface FlatProcessRow {
  readonly node: ProcessNode;
  readonly expanded: boolean;
  readonly hasChildren: boolean;
}

const compare = (a: ProcessSummary, b: ProcessSummary): number =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.pid - b.pid;

/**
 * Builds the parent/child forest. A parent is the entry whose pid equals `parentPid` AND which was created
 * no later than the child; otherwise the parent exited and its PID was reused, so the child is a root.
 * Self-parenting and cycles are broken by promoting one member of the cycle to a root. Children (and
 * roots) sort by name, then PID. Every input process appears exactly once.
 */
export function buildProcessForest(processes: readonly ProcessSummary[]): ProcessNode[] {
  const byPid = new Map<number, ProcessSummary>();
  for (const p of processes) byPid.set(p.pid, p);

  const parentOf = new Map<string, string | null>();
  for (const p of processes) {
    const parent = byPid.get(p.parentPid);
    parentOf.set(processKey(p), parent && parent.pid !== p.pid && parent.createTimeMs <= p.createTimeMs ? processKey(parent) : null);
  }

  // Break cycles: walk each chain; if it loops back onto itself, cut the link where it closes.
  const done = new Set<string>();
  for (const p of processes) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let current: string | null = processKey(p);
    while (current && !done.has(current)) {
      if (onPath.has(current)) { parentOf.set(current, null); break; }
      onPath.add(current);
      path.push(current);
      current = parentOf.get(current) ?? null;
    }
    for (const key of path) done.add(key);
  }

  const childrenOf = new Map<string, ProcessSummary[]>();
  const roots: ProcessSummary[] = [];
  for (const p of processes) {
    const parent = parentOf.get(processKey(p)) ?? null;
    if (parent === null) roots.push(p);
    else {
      const list = childrenOf.get(parent) ?? [];
      list.push(p);
      childrenOf.set(parent, list);
    }
  }

  const build = (p: ProcessSummary, depth: number): ProcessNode => {
    const key = processKey(p);
    return { process: p, key, depth, children: (childrenOf.get(key) ?? []).sort(compare).map((child) => build(child, depth + 1)) };
  };
  return roots.sort(compare).map((root) => build(root, 0));
}

/** Depth-first rows for a virtualized tree; children of a node appear only when its key is in `expandedKeys`. */
export function flattenForest(roots: readonly ProcessNode[], expandedKeys: ReadonlySet<string>): FlatProcessRow[] {
  const rows: FlatProcessRow[] = [];
  const visit = (nodes: readonly ProcessNode[]): void => {
    for (const node of nodes) {
      const expanded = node.children.length > 0 && expandedKeys.has(node.key);
      rows.push({ node, expanded, hasChildren: node.children.length > 0 });
      if (expanded) visit(node.children);
    }
  };
  visit(roots);
  return rows;
}

/** Keeps every node that matches `predicate` plus all of its ancestors (a matching node keeps its whole subtree only if the subtree also matches). */
export function filterForest(roots: readonly ProcessNode[], predicate: (process: ProcessSummary) => boolean): ProcessNode[] {
  const visit = (node: ProcessNode): ProcessNode | null => {
    const children = node.children.map(visit).filter((child): child is ProcessNode => child !== null);
    return predicate(node.process) || children.length ? { ...node, children } : null;
  };
  return roots.map(visit).filter((node): node is ProcessNode => node !== null);
}

/** Keys of nodes that have descendants matching `predicate` (or match themselves), for auto-expanding a filtered tree. */
export function ancestorKeys(roots: readonly ProcessNode[]): Set<string> {
  const keys = new Set<string>();
  const visit = (node: ProcessNode): void => {
    if (node.children.length) keys.add(node.key);
    node.children.forEach(visit);
  };
  roots.forEach(visit);
  return keys;
}

/** Every descendant (children, grandchildren, ...) of the node with `key`, depth-first; [] if absent. */
export function descendantsOf(forest: readonly ProcessNode[], key: string): ProcessSummary[] {
  const find = (nodes: readonly ProcessNode[]): ProcessNode | undefined => {
    for (const node of nodes) {
      if (node.key === key) return node;
      const inner = find(node.children);
      if (inner) return inner;
    }
    return undefined;
  };
  const out: ProcessSummary[] = [];
  const collect = (nodes: readonly ProcessNode[]): void => {
    for (const node of nodes) { out.push(node.process); collect(node.children); }
  };
  const start = find(forest);
  if (start) collect(start.children);
  return out;
}

/** The chain of ancestors from a root down to (not including) the node with `key`. */
export function ancestorsOf(forest: readonly ProcessNode[], key: string): ProcessSummary[] {
  const walk = (nodes: readonly ProcessNode[], trail: ProcessSummary[]): ProcessSummary[] | null => {
    for (const node of nodes) {
      if (node.key === key) return trail;
      const found = walk(node.children, [...trail, node.process]);
      if (found) return found;
    }
    return null;
  };
  return walk(forest, []) ?? [];
}
