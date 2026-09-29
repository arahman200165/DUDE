import type { ProcessListResult, ProcessSummary, SocketEntry } from '../../../shared-logic/system/system-types';
import { endOwnerRequest, filterByQuery, formatEndpoint, groupByPort, isListening, joinSocketsToProcesses, rowKey } from './port-process-lookup-logic';

const proc = (pid: number, name: string, startKey: string): ProcessSummary => ({
  pid, parentPid: 4, name, sessionId: 1, threadCount: 1, handleCount: 1, createTimeMs: 0, startKey,
  kernelTime100ns: 0, userTime100ns: 0, workingSetBytes: 0, privateBytes: 0, basePriority: 8,
});
const processes: ProcessListResult = { sampledAtMs: 0, logicalProcessors: 4, processes: [proc(200, 'node.exe', '111'), proc(300, 'Chrome.exe', '222')] };
const tcp: SocketEntry[] = [
  { protocol: 'tcp', family: 4, localAddress: '0.0.0.0', localPort: 3000, state: 'LISTEN', pid: 200 },
  { protocol: 'tcp', family: 4, localAddress: '127.0.0.1', localPort: 50000, remoteAddress: '127.0.0.1', remotePort: 3000, state: 'ESTABLISHED', pid: 300 },
  { protocol: 'tcp', family: 6, localAddress: '::', localPort: 445, state: 'LISTEN', pid: 999 },
];
const udp: SocketEntry[] = [{ protocol: 'udp', family: 4, localAddress: '0.0.0.0', localPort: 5353, pid: 300 }];
const rows = joinSocketsToProcesses({ entries: tcp }, { entries: udp }, processes);
const ports = (q: string) => filterByQuery(rows, q).map((r) => r.localPort);

describe('port-process-lookup logic', () => {
  it('joins tcp and udp to process name and startKey, Unknown when absent', () => {
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ processName: 'node.exe', startKey: '111', pid: 200 });
    expect(rows[2]).toMatchObject({ processName: 'Unknown', startKey: '' });
    expect(rows[3]).toMatchObject({ protocol: 'udp', processName: 'Chrome.exe' });
    expect('remotePort' in rows[0]).toBe(false);
  });

  it('isListening is LISTEN or udp', () => {
    expect(rows.map(isListening)).toEqual([true, false, true, true]);
  });

  it.each([
    ['3000', [3000, 50000]],
    [':3000', [3000, 50000]],
    ['port:3000', [3000, 50000]],
    ['pid:300', [50000, 5353]],
    ['200', [3000]],
    ['chrome', [50000, 5353]],
    ['chrome 5353', [5353]],
    ['pid:abc', []],
    ['', [3000, 50000, 445, 5353]],
    ['nomatch', []],
  ])('filterByQuery(%s)', (q, expected) => { expect(ports(q)).toEqual(expected); });

  it('groups by local port ascending', () => {
    expect(groupByPort(rows).map((g) => [g.port, g.rows.length])).toEqual([[445, 1], [3000, 1], [5353, 1], [50000, 1]]);
  });

  it('formats endpoints and keys', () => {
    expect(formatEndpoint('::1', 80)).toBe('[::1]:80');
    expect(formatEndpoint('1.2.3.4', 80)).toBe('1.2.3.4:80');
    expect(formatEndpoint(undefined, undefined)).toBe('');
    expect(rowKey(rows[0])).toContain('3000');
  });

  it('endOwnerRequest carries the exact instance, and is null for an unknown owner', () => {
    expect(endOwnerRequest(rows[0])!.ops).toEqual([{ kind: 'process.end', params: { pid: 200, startKey: '111', name: 'node.exe' } }]);
    expect(endOwnerRequest(rows[2])).toBeNull();
  });
});
