import { describe, expect, it } from 'vitest';
import type { ProcessSummary } from '../../../shared-logic/system/system-types';
import { filterRows, formatAge, formatCpu, formatCpuTime, parseQuery, pushSample, sortProcessRows, type ProcessRow, type SearchContext } from './process-viewer-logic';

const row = (pid: number, name: string, cpu = 0, workingSetBytes = 0): ProcessRow => ({
  key: `${pid}:1`, cpu,
  process: { pid, parentPid: 0, name, sessionId: 1, threadCount: 1, handleCount: 1, createTimeMs: pid * 1000, startKey: '1', kernelTime100ns: 0, userTime100ns: 0, workingSetBytes, privateBytes: 0, basePriority: 8 } satisfies ProcessSummary,
});
const empty: SearchContext = { commandLines: new Map(), portsByPid: new Map(), modulesByKey: new Map() };

describe('query filtering', () => {
  const rows = [row(10, 'node.exe'), row(20, 'chrome.exe'), row(30, 'Code.exe')];
  const ctx: SearchContext = {
    commandLines: new Map([['10:1', 'node server.js --port 8080']]),
    portsByPid: new Map([[20, [443, 8080]]]),
    modulesByKey: new Map([['30:1', ['ntdll.dll', 'electron.dll']]]),
  };

  it('matches name case-insensitively and PID exactly', () => {
    expect(filterRows(rows, 'CODE', empty).map((r) => r.process.pid)).toEqual([30]);
    expect(filterRows(rows, '20', empty).map((r) => r.process.pid)).toEqual([20]);
    expect(filterRows(rows, '2', empty)).toHaveLength(0);
  });

  it('matches loaded command lines, ports and modules, and scopes with prefixes', () => {
    expect(filterRows(rows, 'server.js', ctx).map((r) => r.process.pid)).toEqual([10]);
    expect(filterRows(rows, 'port:8080', ctx).map((r) => r.process.pid)).toEqual([20]);
    expect(filterRows(rows, 'mod:electron', ctx).map((r) => r.process.pid)).toEqual([30]);
    expect(filterRows(rows, 'cmd:chrome', ctx)).toHaveLength(0);
    expect(filterRows(rows, 'pid:3', ctx).map((r) => r.process.pid)).toEqual([30]);
  });

  it('requires every term; blank query returns everything', () => {
    expect(filterRows(rows, 'exe port:443', ctx).map((r) => r.process.pid)).toEqual([20]);
    expect(filterRows(rows, '  ', ctx)).toBe(rows);
    expect(parseQuery('unknown:x')).toEqual([{ field: 'any', value: 'unknown:x' }]);
  });
});

describe('sortProcessRows', () => {
  const rows = [row(3, 'b', 5, 100), row(1, 'A', 5, 300), row(2, 'c', 9, 200)];
  it('sorts numerically and by name, breaking ties by PID', () => {
    expect(sortProcessRows(rows, 'cpu', 'desc').map((r) => r.process.pid)).toEqual([2, 1, 3]);
    expect(sortProcessRows(rows, 'workingSet', 'asc').map((r) => r.process.pid)).toEqual([3, 2, 1]);
    expect(sortProcessRows(rows, 'name', 'asc').map((r) => r.process.pid)).toEqual([1, 3, 2]);
  });
});

describe('formatting', () => {
  it('formats CPU percent', () => {
    expect(formatCpu(0)).toBe('0.0');
    expect(formatCpu(0.01)).toBe('<0.1');
    expect(formatCpu(12.345)).toBe('12.3');
  });

  it('formats process age', () => {
    expect(formatAge(0, 5000)).toBe('—');
    expect(formatAge(1000, 46_000)).toBe('45s');
    expect(formatAge(1, 1 + 2 * 3600_000 + 5 * 60_000)).toBe('2h 5m');
    expect(formatAge(1, 1 + 3 * 86400_000 + 4 * 3600_000)).toBe('3d 4h');
  });

  it('formats CPU time', () => {
    expect(formatCpuTime(0)).toBe('0:00:00.00');
    expect(formatCpuTime((3723 * 100 + 25) * 100_000)).toBe('1:02:03.25');
  });

  it('keeps the most recent samples only', () => {
    expect(pushSample([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    expect(pushSample(undefined, 1)).toEqual([1]);
  });
});
