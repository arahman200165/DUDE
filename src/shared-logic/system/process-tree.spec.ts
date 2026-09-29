import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { processKey } from './cpu-delta';
import { ancestorsOf, buildProcessForest, descendantsOf, filterForest, flattenForest, type ProcessNode } from './process-tree';
import type { ProcessSummary } from './system-types';

const proc = (pid: number, parentPid: number, name = `p${pid}`, createTimeMs = pid): ProcessSummary => ({
  pid, parentPid, name, sessionId: 1, threadCount: 1, handleCount: 1, createTimeMs, startKey: String(createTimeMs),
  kernelTime100ns: 0, userTime100ns: 0, workingSetBytes: 0, privateBytes: 0, basePriority: 8,
});

const count = (nodes: readonly ProcessNode[]): number => nodes.reduce((n, node) => n + 1 + count(node.children), 0);

describe('buildProcessForest', () => {
  it('nests children under their parent with depth, sorted by name then PID', () => {
    const forest = buildProcessForest([proc(1, 0, 'root'), proc(5, 1, 'b'), proc(3, 1, 'B'), proc(4, 1, 'a'), proc(6, 4, 'child')]);
    expect(forest).toHaveLength(1);
    expect(forest[0].children.map((c) => c.process.pid)).toEqual([4, 3, 5]);
    expect(forest[0].children[0].children[0]).toMatchObject({ depth: 2 });
  });

  it('treats a child older than its "parent" as a root (reused PID)', () => {
    const forest = buildProcessForest([proc(10, 0, 'new-owner', 5000), proc(20, 10, 'orphan', 100)]);
    expect(forest.map((n) => n.process.pid).sort()).toEqual([10, 20]);
  });

  it('survives self-parenting and cycles without dropping or duplicating a process', () => {
    const list = [proc(1, 1, 'self', 5), proc(2, 3, 'a', 5), proc(3, 2, 'b', 5)];
    const forest = buildProcessForest(list);
    expect(count(forest)).toBe(3);
  });

  it('never loses, duplicates or cycles, for arbitrary process graphs', () => {
    fc.assert(fc.property(
      fc.array(fc.tuple(fc.integer({ min: 0, max: 12 }), fc.integer({ min: 0, max: 12 }), fc.integer({ min: 0, max: 5 })), { maxLength: 30 }),
      (rows) => {
        const seen = new Set<number>();
        const list = rows.filter(([pid]) => (seen.has(pid) ? false : (seen.add(pid), true))).map(([pid, ppid, t]) => proc(pid, ppid, `n${pid}`, t));
        const forest = buildProcessForest(list);
        expect(count(forest)).toBe(list.length);
        const keys = new Set<string>();
        const walk = (nodes: readonly ProcessNode[], depth: number): void => {
          for (const node of nodes) {
            expect(keys.has(node.key)).toBe(false);
            keys.add(node.key);
            expect(node.depth).toBe(depth);
            walk(node.children, depth + 1);
          }
        };
        walk(forest, 0);
        expect(keys.size).toBe(list.length);
      },
    ));
  });
});

describe('forest helpers', () => {
  const forest = buildProcessForest([proc(1, 0, 'root'), proc(2, 1, 'mid'), proc(3, 2, 'leaf'), proc(4, 1, 'other')]);

  it('flattens only expanded branches', () => {
    expect(flattenForest(forest, new Set()).map((r) => r.node.process.pid)).toEqual([1]);
    const rows = flattenForest(forest, new Set([processKey(proc(1, 0)), processKey(proc(2, 1))]));
    expect(rows.map((r) => r.node.process.pid)).toEqual([1, 2, 3, 4]);
  });

  it('filters keeping ancestors of matches', () => {
    const filtered = filterForest(forest, (p) => p.name === 'leaf');
    expect(count(filtered)).toBe(3);
    expect(filterForest(forest, () => false)).toEqual([]);
  });

  it('lists descendants and ancestors', () => {
    expect(descendantsOf(forest, '1:1').map((p) => p.pid).sort()).toEqual([2, 3, 4]);
    expect(descendantsOf(forest, 'nope')).toEqual([]);
    expect(ancestorsOf(forest, '3:3').map((p) => p.pid)).toEqual([1, 2]);
  });
});
