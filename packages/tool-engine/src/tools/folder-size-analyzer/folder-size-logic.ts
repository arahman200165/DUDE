import type { SizeNode, SizeReport } from "../../shared/fs/size-aggregate.js";

/** Pure view logic for the Folder Size Analyzer (Phase 29 item 1): tree rows, treemap layout, export. */

export type SizeSort = 'size' | 'name' | 'files';

export interface SizeTree {
  readonly byPath: ReadonlyMap<string, SizeNode>;
  readonly children: ReadonlyMap<string, readonly SizeNode[]>;
}

export function nameOf(path: string): string {
  return path ? path.slice(path.lastIndexOf('/') + 1) : '(root)';
}

export function parentPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

export function buildTree(report: SizeReport): SizeTree {
  const byPath = new Map(report.nodes.map((node) => [node.path, node]));
  const children = new Map<string, SizeNode[]>();
  for (const node of report.nodes) {
    if (!node.path) continue;
    const parent = parentPath(node.path);
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  return { byPath, children };
}

export function sortNodes(nodes: readonly SizeNode[], sort: SizeSort): SizeNode[] {
  const copy = [...nodes];
  if (sort === 'name') return copy.sort((a, b) => nameOf(a.path).localeCompare(nameOf(b.path)));
  if (sort === 'files') return copy.sort((a, b) => b.files - a.files || b.size - a.size);
  return copy.sort((a, b) => b.size - a.size || nameOf(a.path).localeCompare(nameOf(b.path)));
}

export interface SizeRow {
  readonly node: SizeNode;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  /** Share of the parent folder, 0–1. */
  readonly share: number;
}

/** Depth-first rows for the currently expanded folders, starting from the root's children. */
export function visibleRows(tree: SizeTree, expanded: ReadonlySet<string>, sort: SizeSort, start = ''): SizeRow[] {
  const rows: SizeRow[] = [];
  const visit = (path: string, depth: number) => {
    const parent = tree.byPath.get(path);
    for (const node of sortNodes(tree.children.get(path) ?? [], sort)) {
      const hasChildren = (tree.children.get(node.path)?.length ?? 0) > 0;
      const isOpen = expanded.has(node.path);
      rows.push({ node, depth, hasChildren, expanded: isOpen, share: parent && parent.size ? node.size / parent.size : 0 });
      if (isOpen && hasChildren) visit(node.path, depth + 1);
    }
  };
  visit(start, 0);
  return rows;
}

export interface TreemapRect {
  readonly key: string;
  readonly value: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Squarified treemap (Bruls, Huizing & van Wijk 2000): lays items out in rows along the shorter
 * side, adding an item to the current row while that doesn't worsen the row's worst aspect ratio.
 */
export function squarify(items: readonly { key: string; value: number }[], x: number, y: number, width: number, height: number): TreemapRect[] {
  const values = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (!total || width <= 0 || height <= 0) return [];
  const scale = (width * height) / total;
  const areas = values.map((item) => ({ ...item, area: item.value * scale }));
  const out: TreemapRect[] = [];
  let rect = { x, y, width, height };
  let row: typeof areas = [];

  const worst = (candidate: typeof areas, side: number) => {
    const sum = candidate.reduce((acc, item) => acc + item.area, 0);
    const max = Math.max(...candidate.map((item) => item.area));
    const min = Math.min(...candidate.map((item) => item.area));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const layRow = () => {
    const sum = row.reduce((acc, item) => acc + item.area, 0);
    const horizontal = rect.width >= rect.height;
    const thickness = horizontal ? sum / rect.height : sum / rect.width;
    let offset = 0;
    for (const item of row) {
      const length = item.area / thickness;
      out.push(horizontal
        ? { key: item.key, value: item.value, x: rect.x, y: rect.y + offset, width: thickness, height: length }
        : { key: item.key, value: item.value, x: rect.x + offset, y: rect.y, width: length, height: thickness });
      offset += length;
    }
    rect = horizontal
      ? { x: rect.x + thickness, y: rect.y, width: rect.width - thickness, height: rect.height }
      : { x: rect.x, y: rect.y + thickness, width: rect.width, height: rect.height - thickness };
    row = [];
  };

  for (const item of areas) {
    const side = Math.min(rect.width, rect.height);
    if (!row.length || worst([...row, item], side) <= worst(row, side)) row.push(item);
    else { layRow(); row.push(item); }
  }
  if (row.length) layRow();
  return out;
}

/** Treemap items for one folder: its subfolders, plus its own files and hidden small subfolders as blocks. */
export function treemapItems(tree: SizeTree, path: string): { key: string; value: number; label: string; folder: boolean }[] {
  const node = tree.byPath.get(path);
  const items = (tree.children.get(path) ?? []).map((child) => ({ key: child.path, value: child.size, label: nameOf(child.path), folder: true }));
  if (node?.ownBytes) items.push({ key: `${path}\u0000files`, value: node.ownBytes, label: `${node.ownFiles} file(s) here`, folder: false });
  if (node?.hiddenBytes) items.push({ key: `${path}\u0000hidden`, value: node.hiddenBytes, label: `${node.hiddenDirs} small folder(s)`, folder: false });
  return items;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function reportToCsv(report: SizeReport): string {
  const lines = ['path,bytes,files,subfolders,own_bytes'];
  for (const node of [...report.nodes].sort((a, b) => b.size - a.size)) {
    lines.push([node.path || '.', node.size, node.files, node.dirs, node.ownBytes].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

/** Distinct, hierarchy-deduplicated selection: selecting a folder makes its selected descendants redundant. */
export function normalizeSelection(paths: Iterable<string>): string[] {
  const sorted = [...new Set(paths)].filter(Boolean).sort();
  const out: string[] = [];
  for (const path of sorted) if (!out.some((kept) => path.startsWith(kept + '/'))) out.push(path);
  return out;
}
