import { EMPTY_JS_PLAYGROUND_STATE, applySandboxEvent } from "./js-playground-session.js";

describe('applySandboxEvent', () => {
  it('appends log events to the transcript', () => {
    const state = applySandboxEvent(EMPTY_JS_PLAYGROUND_STATE, {
      kind: 'log',
      requestId: '1',
      level: 'warn',
      args: ['a', 'b'],
    });
    expect(state.logs).toEqual([{ level: 'warn', text: 'a b' }]);
    expect(state.outcome).toBeNull();
  });

  it('records a result outcome', () => {
    const state = applySandboxEvent(EMPTY_JS_PLAYGROUND_STATE, {
      kind: 'result',
      requestId: '1',
      value: '2',
      durationMs: 3,
    });
    expect(state.outcome).toEqual({ kind: 'result', value: '2', durationMs: 3 });
  });

  it('records an error outcome', () => {
    const state = applySandboxEvent(EMPTY_JS_PLAYGROUND_STATE, {
      kind: 'error',
      requestId: '1',
      message: 'boom',
      source: 'thrown',
    });
    expect(state.outcome).toEqual({ kind: 'error', message: 'boom', stack: undefined });
  });

  it('records a terminated outcome without clearing prior logs', () => {
    const withLogs = applySandboxEvent(EMPTY_JS_PLAYGROUND_STATE, {
      kind: 'log',
      requestId: '1',
      level: 'log',
      args: ['still going'],
    });
    const state = applySandboxEvent(withLogs, { kind: 'terminated', requestId: '1', reason: 'timeout' });
    expect(state.logs).toHaveLength(1);
    expect(state.outcome).toEqual({ kind: 'terminated', reason: 'timeout' });
  });
});
