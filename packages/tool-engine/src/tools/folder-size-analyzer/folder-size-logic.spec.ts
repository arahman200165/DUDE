import type { SizeNode, SizeReport } from "../../shared/fs/size-aggregate.js";
import { buildTree, normalizeSelection, reportToCsv, squarify, treemapItems, visibleRows } from "./folder-size-logic.js";

const node = (path: string, size: number, extra: Partial<SizeNode> = {}): SizeNode => ({ path, size, files: 1, dirs: 0, ownBytes: 0, ownFiles: 0, hiddenDirs: 0, hiddenBytes: 0, ...extra });
const report = (nodes: SizeNode[]): SizeReport => ({ totalBytes: nodes[0].size, totalFiles: 0, totalDirs: nodes.length - 1, links: 0, nodes, prunedDirs: 0, largestFiles: [], byExtension: [], byAge: [] });

describe('folder size view logic', () => {
  const tree = buildTree(report([node('', 100, { ownBytes: 10, ownFiles: 2 }), node('a', 60), node('a/x', 50), node('b', 30)]));

  it('lists expanded folders depth-first, sorted by size, with share of parent', () => {
    expect(visibleRows(tree, new Set(), 'size').map((row) => row.node.path)).toEqual(['a', 'b']);
    const rows = visibleRows(tree, new Set(['a']), 'size');
    expect(rows.map((row) => [row.node.path, row.depth])).toEqual([['a', 0], ['a/x', 1], ['b', 0]]);
    expect(rows[0]).toMatchObject({ hasChildren: true, expanded: true, share: 0.6 });
    expect(visibleRows(tree, new Set(), 'name').map((row) => row.node.path)).toEqual(['a', 'b']);
  });

  it('squarifies into rectangles that exactly tile the area', () => {
    const rects = squarify([{ key: 'a', value: 6 }, { key: 'b', value: 6 }, { key: 'c', value: 4 }, { key: 'd', value: 3 }, { key: 'e', value: 2 }, { key: 'f', value: 2 }, { key: 'g', value: 1 }], 0, 0, 600, 400);
    expect(rects).toHaveLength(7);
    const area = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
    expect(area).toBeCloseTo(240_000, 3);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(-1e-6);
      expect(rect.x + rect.width).toBeLessThanOrEqual(600 + 1e-6);
      expect(rect.y + rect.height).toBeLessThanOrEqual(400 + 1e-6);
    }
    expect(squarify([], 0, 0, 10, 10)).toEqual([]);
  });

  it("adds the folder's own files as a treemap block, exports CSV, and dedupes nested selections", () => {
    expect(treemapItems(tree, '').map((item) => item.label)).toEqual(['a', 'b', '2 file(s) here']);
    expect(reportToCsv(report([node('', 5), node('a,b', 5)])).split('\n')[2]).toBe('"a,b",5,1,0,0');
    expect(normalizeSelection(['a/x', 'a', 'b', 'ab'])).toEqual(['a', 'ab', 'b']);
  });
});
