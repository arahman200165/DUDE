import { describe, expect, it } from 'vitest';
import {
  allSectionsOn, BUNDLE_SECTION_IDS, DEFAULT_BUNDLE_OPTIONS, estimateSections, type BundleCounts,
} from "./bundle-types.js";
import type { ProcessSummary } from "./system-types.js";
import {
  buildPreviewRows, clampOptions, defaultBundleName, filterProcesses, findTarget, newExportId, parseTargetRoute, selectedBytes, selectedCount, sizeWarning,
} from "@dude/tool-engine/tools/process-diagnostic-bundle/process-diagnostic-bundle-logic";

const proc = (pid: number, name: string, startKey = String(pid * 10)): ProcessSummary => ({
  pid, parentPid: 4, name, sessionId: 1, threadCount: 4, handleCount: 100, createTimeMs: 1, startKey,
  kernelTime100ns: 0, userTime100ns: 0, workingSetBytes: 1, privateBytes: 1, basePriority: 8,
});
const counts: BundleCounts = { treeNodes: 3, commandLineChars: 120, envBytes: 4000, modules: 80, threads: 12, handles: 300, ports: 2, privateBytes: 500 * 1024 * 1024, workingSetBytes: 200 * 1024 * 1024 };

describe('parseTargetRoute / findTarget', () => {
  it('accepts a pid with an optional startKey and rejects junk', () => {
    expect(parseTargetRoute('1234', null)).toEqual({ pid: 1234, startKey: null });
    expect(parseTargetRoute('1234', '133000')).toEqual({ pid: 1234, startKey: '133000' });
    expect(parseTargetRoute('0', null)).toBeNull();
    expect(parseTargetRoute('12x', null)).toBeNull();
    expect(parseTargetRoute('99999999999', null)).toBeNull();
    expect(parseTargetRoute('5', 'abc')).toBeNull();
    expect(parseTargetRoute(null, '5')).toBeNull();
  });

  it('matches the exact instance when a startKey is given and never a reused pid', () => {
    const list = [proc(10, 'a.exe', '100'), proc(20, 'b.exe', '200')];
    expect(findTarget(list, { pid: 10, startKey: null })?.name).toBe('a.exe');
    expect(findTarget(list, { pid: 10, startKey: '100' })?.name).toBe('a.exe');
    expect(findTarget(list, { pid: 10, startKey: '999' })).toBeNull();
  });
});

describe('filterProcesses', () => {
  const list = [proc(300, 'Zed.exe'), proc(12, 'node.exe'), proc(120, 'node.exe'), proc(7, 'alpha.exe')];
  it('filters by name substring or pid prefix and sorts by name then pid', () => {
    expect(filterProcesses(list, '').rows.map((p) => p.pid)).toEqual([7, 12, 120, 300]);
    expect(filterProcesses(list, 'NODE').rows.map((p) => p.pid)).toEqual([12, 120]);
    expect(filterProcesses(list, '12').rows.map((p) => p.pid)).toEqual([12, 120]);
  });
  it('caps rendered rows but reports the true total', () => {
    const many = Array.from({ length: 500 }, (_, i) => proc(i + 1, `p${i}.exe`));
    const result = filterProcesses(many, '');
    expect(result.rows).toHaveLength(300);
    expect(result.total).toBe(500);
  });
});

describe('field and size preview', () => {
  it('has a row per section with fields and a size, every section on by default', () => {
    const rows = buildPreviewRows(estimateSections(counts, DEFAULT_BUNDLE_OPTIONS, true), allSectionsOn());
    expect(rows.map((r) => r.id)).toEqual([...BUNDLE_SECTION_IDS]);
    expect(rows.every((r) => r.on && r.fields.length > 0 && r.estimateBytes > 0)).toBe(true);
    expect(rows.find((r) => r.id === 'minidump')!.file).toBe('process.dmp');
  });

  it('totals only the toggled-on sections', () => {
    const estimates = estimateSections(counts, DEFAULT_BUNDLE_OPTIONS, true);
    const none = Object.fromEntries(BUNDLE_SECTION_IDS.map((id) => [id, false])) as ReturnType<typeof allSectionsOn>;
    expect(selectedBytes(estimates, none)).toBe(0);
    expect(selectedCount(none)).toBe(0);
    const ports = { ...none, ports: true };
    expect(selectedBytes(estimates, ports)).toBe(estimates.find((e) => e.id === 'ports')!.estimateBytes);
    expect(selectedCount(allSectionsOn())).toBe(11);
  });

  it('prices a full-memory dump from private bytes and a minidump much smaller; samples scale with seconds', () => {
    const size = (options: typeof DEFAULT_BUNDLE_OPTIONS, id: string) => estimateSections(counts, options, true).find((e) => e.id === id)!.estimateBytes;
    expect(size({ ...DEFAULT_BUNDLE_OPTIONS, fullDump: true }, 'minidump')).toBeGreaterThan(counts.privateBytes);
    expect(size(DEFAULT_BUNDLE_OPTIONS, 'minidump')).toBeLessThan(5 * 1024 * 1024);
    expect(size({ ...DEFAULT_BUNDLE_OPTIONS, sampleSeconds: 60 }, 'samples')).toBeGreaterThan(size(DEFAULT_BUNDLE_OPTIONS, 'samples'));
  });

  it('notes that handles need elevation only when not elevated', () => {
    const note = (elevated: boolean) => buildPreviewRows(estimateSections(counts, DEFAULT_BUNDLE_OPTIONS, elevated), allSectionsOn()).find((r) => r.id === 'handles')!.note;
    expect(note(false)).toMatch(/elevated/i);
    expect(note(true)).toBeNull();
  });
});

describe('sizeWarning / clampOptions / naming', () => {
  it('warns about secrets for any dump and about size from 1 GiB', () => {
    expect(sizeWarning(1000, false, false)).toBeNull();
    expect(sizeWarning(1000, true, false)).toMatch(/secrets/);
    expect(sizeWarning(1000, true, true)).toMatch(/full-memory/i);
    expect(sizeWarning(2 * 1024 ** 3, false, false)).toMatch(/gigabytes/);
  });
  it('clamps options into the supported ranges', () => {
    expect(clampOptions({ eventHours: 0, sampleSeconds: 9999, fullDump: false })).toEqual({ eventHours: 1, sampleSeconds: 120, fullDump: false });
    expect(clampOptions({ eventHours: NaN, sampleSeconds: NaN, fullDump: true })).toEqual({ eventHours: 24, sampleSeconds: 10, fullDump: true });
  });
  it('builds a safe default file name and a valid export id', () => {
    expect(defaultBundleName({ name: 'we<ird>.exe', pid: 42 }, new Date(2026, 8, 29, 15, 30, 5))).toBe('we_ird_.exe-42-20260929-153005-diagnostic-bundle.zip');
    expect(newExportId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
