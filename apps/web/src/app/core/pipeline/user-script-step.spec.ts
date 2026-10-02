import { describe, expect, it } from 'vitest';
import { buildScriptSource, runUserScriptStep, SandboxRunner } from "@dude/tool-engine/core/pipeline/user-script-step";
import { UserScriptDefinition } from "@dude/domain/core/pipeline/pipeline.model";
import { SandboxEvent } from "@dude/contracts/sandbox/code-sandbox-protocol";

function script(overrides: Partial<UserScriptDefinition> = {}): UserScriptDefinition {
  return {
    id: 's1',
    name: 'Test script',
    body: 'return input.value.toUpperCase();',
    accepts: ['text'],
    produces: ['text'],
    timeoutMs: 1000,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

/** A fake sandbox that immediately fires one event, simulating `CodeSandboxHost.run`. */
function fakeSandbox(event: SandboxEvent): SandboxRunner {
  return {
    run: (_code, _timeoutMs, onEvent) => {
      onEvent(event);
      return { requestId: 'r1', cancel: () => {} };
    },
  };
}

describe('buildScriptSource', () => {
  it('inlines the PipelineValue as a JSON literal ahead of the script body', () => {
    const source = buildScriptSource(script({ body: 'return 1;' }), { type: 'text', value: 'hi' });
    expect(source).toBe('const input = {"type":"text","value":"hi"};\nreturn 1;');
  });
});

describe('runUserScriptStep', () => {
  it('resolves ok with the parsed, type-validated result', async () => {
    const result = await runUserScriptStep(
      fakeSandbox({ kind: 'result', requestId: 'r1', value: '"HELLO"', durationMs: 1 }),
      script(),
      { type: 'text', value: 'hello' },
    );
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'HELLO' } });
  });

  it('fails when the script never returns a value', async () => {
    const result = await runUserScriptStep(
      fakeSandbox({ kind: 'result', requestId: 'r1', value: 'undefined', durationMs: 1 }),
      script(),
      { type: 'text', value: 'x' },
    );
    expect(result).toEqual({ ok: false, error: { message: 'Script did not return a value.', kind: 'invalid-input' } });
  });

  it("fails when the returned value doesn't match the declared produces type", async () => {
    const result = await runUserScriptStep(
      fakeSandbox({ kind: 'result', requestId: 'r1', value: '42', durationMs: 1 }),
      script({ produces: ['table'] }),
      { type: 'text', value: 'x' },
    );
    expect(result.ok).toBe(false);
  });

  it('maps a sandbox error event to an execution-error result', async () => {
    const result = await runUserScriptStep(
      fakeSandbox({ kind: 'error', requestId: 'r1', message: 'boom', source: 'thrown' }),
      script(),
      { type: 'text', value: 'x' },
    );
    expect(result).toEqual({ ok: false, error: { message: 'boom', kind: 'execution-error' } });
  });

  it('maps a timeout termination to a clear message', async () => {
    const result = await runUserScriptStep(
      fakeSandbox({ kind: 'terminated', requestId: 'r1', reason: 'timeout' }),
      script({ timeoutMs: 2000 }),
      { type: 'text', value: 'x' },
    );
    expect(result).toEqual({ ok: false, error: { message: 'Script exceeded its 2000ms limit.', kind: 'execution-error' } });
  });

  it('ignores log events and waits for the terminal event', async () => {
    const events: SandboxEvent[] = [
      { kind: 'log', requestId: 'r1', level: 'log', args: ['hi'] },
      { kind: 'result', requestId: 'r1', value: '"done"', durationMs: 1 },
    ];
    const sandbox: SandboxRunner = {
      run: (_c, _t, onEvent) => {
        for (const event of events) onEvent(event);
        return { requestId: 'r1', cancel: () => {} };
      },
    };
    const result = await runUserScriptStep(sandbox, script(), { type: 'text', value: 'x' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'done' } });
  });
});
