import { describe, expect, it } from 'vitest';
import { INTERNAL_WORKER_ARG, internalWorkerArgs, runInternalWorkerIfRequested } from './worker-mode.js';

describe('internalWorkerArgs', () => {
  it('re-spawns the executable itself inside the single-executable application', () => {
    expect(internalWorkerArgs('ping', { sea: true, execPath: 'C:/hub/dude-hub.exe' })).toEqual({
      command: 'C:/hub/dude-hub.exe',
      args: [INTERNAL_WORKER_ARG, 'ping'],
    });
  });

  it('re-spawns node with the bundle path in a Node-process Hub', () => {
    expect(internalWorkerArgs('ping', { sea: false, execPath: '/usr/bin/node', scriptPath: '/app/dude-hub.cjs' })).toEqual({
      command: '/usr/bin/node',
      args: ['/app/dude-hub.cjs', INTERNAL_WORKER_ARG, 'ping'],
    });
  });
});

describe('runInternalWorkerIfRequested', () => {
  it('ignores every ordinary invocation', async () => {
    expect(await runInternalWorkerIfRequested([])).toBeUndefined();
    expect(await runInternalWorkerIfRequested(['run', '--port', '0'])).toBeUndefined();
  });

  it('refuses an unknown worker kind', async () => {
    expect(await runInternalWorkerIfRequested([INTERNAL_WORKER_ARG, 'nope'])).toBe(2);
  });
});
