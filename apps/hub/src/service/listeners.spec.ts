import { describe, expect, it } from 'vitest';
import type { ExecFn, ExecResult } from './common.js';
import { auditNativeListeners, listTcpListeners, parseNetstatListeners, parseTasklist, processNames } from './listeners.js';

const NETSTAT_V4 = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1048
  TCP    0.0.0.0:47821          0.0.0.0:0              LISTENING       4120
  TCP    127.0.0.1:5555         0.0.0.0:0              LISTENING       7000
  TCP    192.168.1.5:139        0.0.0.0:0              LISTENING       4
  TCP    192.168.1.5:50123      52.1.2.3:443           ESTABLISHED     9100
`;
const NETSTAT_V6 = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    [::]:135               [::]:0                 LISTENING       1048
  TCP    [::1]:8080             [::]:0                 LISTENING       7000
  TCP    [fe80::1%12]:445       [::]:0                 LISTENING       4
`;
const TASKLIST = [
  '"System","4","Services","0","144 K"',
  '"svchost.exe","1048","Services","0","11,000 K"',
  '"dude-hub.exe","4120","Services","0","80,000 K"',
  '"dude-agent.exe","7000","Console","1","60,000 K"',
  '"DUDE.exe","9100","Console","1","120,000 K"',
].join('\r\n');

const result = (stdout: string, code = 0): ExecResult => ({ stdout, stderr: '', code });
const exec = (over: { v4?: string; v6?: string; tasks?: string; netstatCode?: number } = {}): ExecFn => async (file, args) => {
  if (file === 'netstat') return result(args.includes('TCPv6') ? (over.v6 ?? NETSTAT_V6) : (over.v4 ?? NETSTAT_V4), over.netstatCode ?? 0);
  if (file === 'tasklist') return result(over.tasks ?? TASKLIST);
  return result('');
};

describe('parseNetstatListeners', () => {
  it('parses IPv4 listening rows and ignores established connections', () => {
    expect(parseNetstatListeners(NETSTAT_V4)).toEqual([
      { pid: 1048, address: '0.0.0.0', port: 135, scope: 'any' },
      { pid: 4120, address: '0.0.0.0', port: 47821, scope: 'any' },
      { pid: 7000, address: '127.0.0.1', port: 5555, scope: 'loopback' },
      { pid: 4, address: '192.168.1.5', port: 139, scope: 'specific' },
    ]);
  });
  it('parses bracketed IPv6 rows, zone ids and localized state text', () => {
    expect(parseNetstatListeners(NETSTAT_V6)).toEqual([
      { pid: 1048, address: '::', port: 135, scope: 'any' },
      { pid: 7000, address: '::1', port: 8080, scope: 'loopback' },
      { pid: 4, address: 'fe80::1', port: 445, scope: 'specific' },
    ]);
    expect(parseNetstatListeners('  TCP    0.0.0.0:80    0.0.0.0:0    ABHOEREN    12')).toHaveLength(1);
    expect(parseNetstatListeners('garbage\r\n\r\nnot a row')).toEqual([]);
  });
  it('listTcpListeners merges IPv4 and IPv6, and is null when netstat fails', async () => {
    expect(await listTcpListeners(exec())).toHaveLength(7);
    expect(await listTcpListeners(exec({ netstatCode: 1 }))).toBeNull();
    expect(await listTcpListeners(() => Promise.reject(new Error('ENOENT')))).toBeNull();
  });
});

describe('tasklist', () => {
  it('parses CSV rows into pid to lower-case image', async () => {
    expect(parseTasklist(TASKLIST).get(7000)).toBe('dude-agent.exe');
    expect([...(await processNames(exec(), [7000, 9100]))!]).toEqual([[7000, 'dude-agent.exe'], [9100, 'dude.exe']]);
    expect(await processNames(exec({ tasks: 'INFO: nothing' }), [1])).toBeNull();
  });
});

describe('auditNativeListeners', () => {
  it('any Agent TCP listener is a violation, loopback included; the desktop LAN listener is info only', async () => {
    const audit = await auditNativeListeners(exec(), 'win32');
    expect(audit.applicable).toBe(true);
    expect(audit.partial).toBe(false);
    expect(audit.exposed.map((l) => [l.image, l.scope, l.port])).toEqual([['dude-agent.exe', 'loopback', 5555], ['dude-agent.exe', 'loopback', 8080]]);
    expect(audit.desktopLan).toEqual([]);

    const lan = await auditNativeListeners(exec({
      v4: '  TCP    0.0.0.0:9000    0.0.0.0:0    LISTENING    9100\r\n  TCP    127.0.0.1:9001    0.0.0.0:0    LISTENING    9100\r\n', v6: '',
    }), 'win32');
    expect(lan.exposed).toEqual([]);
    expect(lan.desktopLan).toEqual([{ image: 'dude.exe', pid: 9100, address: '0.0.0.0', port: 9000, scope: 'any' }]);
  });

  it('an Agent bound to a non-loopback address is reported with its scope', async () => {
    const audit = await auditNativeListeners(exec({ v4: '  TCP    0.0.0.0:6000    0.0.0.0:0    LISTENING    7000\r\n', v6: '' }), 'win32');
    expect(audit.exposed).toEqual([{ image: 'dude-agent.exe', pid: 7000, address: '0.0.0.0', port: 6000, scope: 'any' }]);
  });

  it('none exposed passes; unreadable output is partial; non-Windows is not applicable', async () => {
    const none = await auditNativeListeners(exec({ v4: '  TCP    0.0.0.0:135    0.0.0.0:0    LISTENING    1048\r\n', v6: '' }), 'win32');
    expect(none).toEqual({ applicable: true, exposed: [], desktopLan: [], partial: false });
    expect(await auditNativeListeners(exec({ v4: 'nothing parseable', v6: '' }), 'win32')).toEqual({ applicable: true, exposed: [], desktopLan: [], partial: true });
    expect(await auditNativeListeners(exec({ tasks: 'ERROR' }), 'win32')).toMatchObject({ applicable: true, exposed: [], partial: true });
    expect(await auditNativeListeners(exec({ netstatCode: 1 }), 'win32')).toMatchObject({ applicable: true, partial: true });
    const calls: string[] = [];
    expect(await auditNativeListeners(async (file) => { calls.push(file); return result(''); }, 'linux')).toEqual({ applicable: false, exposed: [], desktopLan: [], partial: false });
    expect(calls).toEqual([]);
  });
});
