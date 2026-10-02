import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { HelloResponse } from '@dude/contracts/hub';
import { tempDir } from '../server/test-helpers.js';
import type { ExecFn, ExecResult, ServiceDeps, ServiceState } from './common.js';

export interface FakeSystem {
  /** Every external command, as `file arg arg`. */
  calls: string[];
  exec: ExecFn;
  state: ServiceState;
  elevated: boolean;
  firewallRule: boolean;
  /** Per-command overrides: return a result to replace the default, or undefined to fall through. */
  override?: (file: string, args: readonly string[]) => ExecResult | undefined;
}

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', code: 0 });

const SC_STATE: Record<string, string> = {
  running: '4  RUNNING', stopped: '1  STOPPED', starting: '2  START_PENDING', stopping: '3  STOP_PENDING', paused: '7  PAUSED', unknown: '0  UNKNOWN',
};

/** A scripted Windows: fltmc, sc.exe, the WinSW wrapper, icacls and netsh, with service and firewall state that follows the commands. */
export function fakeSystem(initial: Partial<Pick<FakeSystem, 'state' | 'elevated' | 'firewallRule'>> = {}): FakeSystem {
  const system: FakeSystem = {
    calls: [],
    state: initial.state ?? 'not-installed',
    elevated: initial.elevated ?? true,
    firewallRule: initial.firewallRule ?? false,
    exec: async (file, args) => {
      system.calls.push([file, ...args].join(' '));
      const custom = system.override?.(file, args);
      if (custom) return custom;
      const name = path.basename(file).toLowerCase();
      if (name === 'fltmc') return system.elevated ? ok() : { stdout: '', stderr: 'access denied', code: 5 };
      if (name === 'sc.exe') {
        if (args[0] === 'query') return system.state === 'not-installed' ? { stdout: '', stderr: '', code: 1060 } : ok(`SERVICE_NAME: DudeHub\n        STATE              : ${SC_STATE[system.state]}\n`);
        if (args[0] === 'delete') { system.state = 'not-installed'; return ok(); }
        return ok();
      }
      if (name === 'dudehub.exe') {
        if (args[0] === 'install') system.state = 'stopped';
        if (args[0] === 'start') system.state = 'running';
        if (args[0] === 'stop') system.state = 'stopped';
        if (args[0] === 'uninstall') system.state = 'not-installed';
        return ok();
      }
      if (name === 'netsh') {
        if (args[2] === 'add') system.firewallRule = true;
        if (args[2] === 'delete') { const had = system.firewallRule; system.firewallRule = false; return had ? ok() : { stdout: 'No rules match', stderr: '', code: 1 }; }
        if (args[2] === 'show') return system.firewallRule ? ok('Rule Name: DUDE Hub (LAN)') : { stdout: 'No rules match', stderr: '', code: 1 };
      }
      return ok();
    },
  };
  return system;
}

export function helloFor(version: string, over: Partial<HelloResponse> = {}): HelloResponse {
  return {
    service: 'dude-hub',
    protocolVersion: 1,
    minClientProtocol: 1,
    hubVersion: version,
    hubInstanceId: '00000000-0000-4000-8000-000000000000',
    environmentId: null,
    bootstrapped: false,
    tls: { spkiSha256: 'A'.repeat(43), nextSpkiSha256: null },
    ...over,
  } as HelloResponse;
}

export interface Fixture {
  system: FakeSystem;
  sourceDir: string;
  installDir: string;
  dataDir: string;
  out: string[];
  err: string[];
  deps: ServiceDeps;
}

/** A staged source directory, empty install/data directories and quiet, instant dependencies. */
export function fixture(initial: Partial<Pick<FakeSystem, 'state' | 'elevated' | 'firewallRule'>> = {}, deps: ServiceDeps = {}): Fixture {
  const root = tempDir('hub-svc-');
  const sourceDir = path.join(root, 'stage');
  mkdirSync(path.join(sourceDir, 'service', 'web'), { recursive: true });
  writeFileSync(path.join(sourceDir, 'dude-hub.exe'), 'hub-binary');
  writeFileSync(path.join(sourceDir, 'DudeHub.exe'), 'wrapper-binary');
  writeFileSync(path.join(sourceDir, 'service', 'web', 'index.html'), '<html></html>');
  const system = fakeSystem(initial);
  const out: string[] = [];
  const err: string[] = [];
  let clock = 0;
  return {
    system,
    sourceDir,
    installDir: path.join(root, 'Program Files', 'DUDE Hub'),
    dataDir: path.join(root, 'ProgramData', 'DUDE', 'Hub'),
    out,
    err,
    deps: {
      exec: system.exec,
      platform: 'win32',
      env: { ProgramFiles: path.join(root, 'pf'), ProgramData: path.join(root, 'pd') },
      stdout: (t) => void out.push(t),
      stderr: (t) => void err.push(t),
      sourceDir,
      hello: async () => helloFor('1.0.0'),
      call: async () => { throw new Error('not running'); },
      sleep: async () => { clock += 1000; },
      now: () => clock,
      helloTimeoutMs: 5000,
      ...deps,
    },
  };
}
