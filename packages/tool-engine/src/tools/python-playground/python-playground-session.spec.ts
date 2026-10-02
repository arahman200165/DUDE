import { EMPTY_PYTHON_PLAYGROUND_STATE, applyPythonSandboxEvent } from "./python-playground-session.js";

describe('applyPythonSandboxEvent', () => {
  it('appends log events to the transcript', () => {
    const state = applyPythonSandboxEvent(EMPTY_PYTHON_PLAYGROUND_STATE, {
      kind: 'log',
      requestId: '1',
      level: 'log',
      args: ['hello'],
    });
    expect(state.logs).toEqual([{ level: 'log', text: 'hello' }]);
  });

  it('records a result outcome', () => {
    const state = applyPythonSandboxEvent(EMPTY_PYTHON_PLAYGROUND_STATE, {
      kind: 'result',
      requestId: '1',
      value: '4',
      durationMs: 12,
    });
    expect(state.outcome).toEqual({ kind: 'result', value: '4', durationMs: 12 });
  });

  it('records an error outcome', () => {
    const state = applyPythonSandboxEvent(EMPTY_PYTHON_PLAYGROUND_STATE, {
      kind: 'error',
      requestId: '1',
      message: 'NameError: x is not defined',
      source: 'thrown',
    });
    expect(state.outcome).toEqual({ kind: 'error', message: 'NameError: x is not defined' });
  });

  it('records a terminated outcome', () => {
    const state = applyPythonSandboxEvent(EMPTY_PYTHON_PLAYGROUND_STATE, { kind: 'terminated', requestId: '1', reason: 'timeout' });
    expect(state.outcome).toEqual({ kind: 'terminated', reason: 'timeout' });
  });
});
