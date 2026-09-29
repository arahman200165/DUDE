import type { ProcessSummary } from '../../../shared-logic/system/system-types';
import { affinityMask, affinityRequest, dumpFileName, dumpRequest, joinWindowsPath, priorityRequest, simpleActionRequest } from './process-actions-logic';

const p: ProcessSummary = {
  pid: 42, parentPid: 4, name: 'Code.exe', sessionId: 1, threadCount: 1, handleCount: 1, createTimeMs: 1, startKey: '123456', kernelTime100ns: 0,
  userTime100ns: 0, workingSetBytes: 0, privateBytes: 0, basePriority: 8,
};
const ref = { pid: 42, startKey: '123456', name: 'Code.exe' };

describe('process action requests', () => {
  it('builds simple op kinds with the exact instance', () => {
    for (const action of ['end', 'end-tree', 'restart', 'suspend', 'resume'] as const) {
      expect(simpleActionRequest(p, action).ops).toEqual([{ kind: `process.${action}`, params: ref }]);
    }
    expect(simpleActionRequest(p, 'end').tool).toBe('process-viewer');
  });

  it('builds priority requests', () => {
    expect(priorityRequest(p, 'idle').ops).toEqual([{ kind: 'process.set-priority', params: { ...ref, priorityClass: 'idle' } }]);
  });

  it('turns selected CPUs into a hex mask', () => {
    expect(affinityMask([0])).toBe('0x1');
    expect(affinityMask([0, 1, 2, 3])).toBe('0xf');
    expect(affinityMask(new Set([1, 3]))).toBe('0xa');
    expect(affinityMask([63])).toBe('0x8000000000000000');
    expect(affinityMask([])).toBeNull();
    expect(affinityMask([64])).toBeNull();
    expect(affinityRequest(p, [])).toBeNull();
    expect(affinityRequest(p, [0, 2])?.ops).toEqual([{ kind: 'process.set-affinity', params: { ...ref, affinityMask: '0x5' } }]);
  });

  it('builds dump requests and default file names', () => {
    expect(dumpFileName(p)).toBe('Code-42.dmp');
    expect(joinWindowsPath('C:\\dumps\\', 'a.dmp')).toBe('C:\\dumps\\a.dmp');
    expect(dumpRequest(p, 'C:\\d\\a.dmp', true).ops).toEqual([{ kind: 'process.dump', params: { ...ref, outputPath: 'C:\\d\\a.dmp', full: true } }]);
    expect(dumpRequest(p, 'C:\\d\\a.dmp', false).ops[0].params).toMatchObject({ full: false });
  });
});
