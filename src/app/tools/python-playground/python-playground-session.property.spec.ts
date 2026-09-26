import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { EMPTY_PYTHON_PLAYGROUND_STATE, applyPythonSandboxEvent } from './python-playground-session';

describe('Python playground session properties', () => {
  it('appends arbitrary log text without changing prior log entries', () => {
    invariant(
      ({ level, args }) => applyPythonSandboxEvent(EMPTY_PYTHON_PLAYGROUND_STATE, { kind: 'log', requestId: 'property', level, args }),
      fc.record({ level: fc.constantFrom('log', 'info', 'warn', 'error'), args: fc.array(fc.string()) }),
      (state, input) => state.logs.length === 1 && state.logs[0].text === input.args.join(' '),
    );
  });
});
