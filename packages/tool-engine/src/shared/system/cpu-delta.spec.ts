import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cpuPercents, processKey } from "./cpu-delta.js";
import type { ProcessListResult, ProcessSummary } from "@dude/contracts/system/system-types";

const proc = (pid: number, cpu100ns: number, startKey = '1'): ProcessSummary => ({
  pid, parentPid: 0, name: `p${pid}`, sessionId: 1, threadCount: 1, handleCount: 1, createTimeMs: 1, startKey,
  kernelTime100ns: cpu100ns / 2, userTime100ns: cpu100ns / 2, workingSetBytes: 0, privateBytes: 0, basePriority: 8,
});
const sample = (sampledAtMs: number, processes: ProcessSummary[], logicalProcessors = 4): ProcessListResult => ({ sampledAtMs, logicalProcessors, processes });

describe('cpuPercents', () => {
  it('reports 0 with no previous sample', () => {
    expect(cpuPercents(null, sample(1000, [proc(1, 5e7)])).get('1:1')).toBe(0);
  });

  it('computes the share of total machine capacity', () => {
    // 1 s wall, 4 CPUs => 4 s of CPU capacity; 1 s used => 25%.
    const prev = sample(1000, [proc(1, 0)]);
    const next = sample(2000, [proc(1, 1e7)]);
    expect(cpuPercents(prev, next).get('1:1')).toBeCloseTo(25, 6);
  });

  it('treats a new process or a reused PID as 0', () => {
    const prev = sample(1000, [proc(1, 9e9, 'old')]);
    const next = sample(2000, [proc(1, 1e7, 'new'), proc(2, 1e7)]);
    const result = cpuPercents(prev, next);
    expect(result.get('1:new')).toBe(0);
    expect(result.get('2:1')).toBe(0);
  });

  it('is 0 when the wall clock did not advance', () => {
    const prev = sample(1000, [proc(1, 0)]);
    expect(cpuPercents(prev, sample(1000, [proc(1, 1e7)])).get('1:1')).toBe(0);
  });

  it('always stays within 0-100 for arbitrary samples', () => {
    fc.assert(fc.property(
      fc.integer({ min: -1000, max: 10_000 }), fc.integer({ min: 0, max: 1e12 }), fc.integer({ min: 0, max: 1e12 }), fc.integer({ min: 0, max: 64 }),
      (wall, a, b, cpus) => {
        const value = cpuPercents(sample(0, [proc(1, a)], cpus), sample(wall, [proc(1, b)], cpus)).get('1:1')!;
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      },
    ));
  });

  it('builds the pid:startKey identity', () => {
    expect(processKey({ pid: 7, startKey: '99' })).toBe('7:99');
  });
});
