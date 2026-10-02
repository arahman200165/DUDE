import { DudeDataType } from "@dude/shared-types/shared/models/tool-io.model";
import { PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { SandboxEvent } from "@dude/contracts/sandbox/code-sandbox-protocol";
import { UserScriptDefinition } from "@dude/domain/core/pipeline/pipeline.model";

/** The subset of `CodeSandboxHost` this needs — kept generic so it's independently testable without a real iframe. */
export interface SandboxRunner {
  run(code: string, timeoutMs: number, onEvent: (event: SandboxEvent) => void): { requestId: string; cancel(): void };
}

/**
 * A user script is a function *body*, not a module (no import/export) — identical mental model
 * to JS Playground. `input` is the incoming `PipelineValue` envelope (`{type, value}`), inlined
 * as a JSON literal ahead of the user's code; every `DudeDataType` payload is already plain
 * JSON (see `pipeline-step.model.ts`), so this is a bare `JSON.stringify`, no protocol beyond it.
 */
export function buildScriptSource(script: UserScriptDefinition, input: PipelineValue): string {
  return `const input = ${JSON.stringify(input)};\n${script.body}`;
}

function matchesDeclaredShape(type: DudeDataType, value: unknown): boolean {
  switch (type) {
    case 'text':
    case 'bytes':
    case 'url':
      return typeof value === 'string';
    case 'json':
      return true;
    case 'table':
      return (
        !!value &&
        typeof value === 'object' &&
        Array.isArray((value as { columns?: unknown }).columns) &&
        Array.isArray((value as { rows?: unknown }).rows)
      );
    case 'file':
      return (
        !!value &&
        typeof value === 'object' &&
        typeof (value as { name?: unknown }).name === 'string' &&
        typeof (value as { base64?: unknown }).base64 === 'string'
      );
    case 'http-response':
      return !!value && typeof value === 'object' && typeof (value as { status?: unknown }).status === 'number';
  }
}

/**
 * Runs a user script as a pipeline step through the existing, unmodified Phase 6 sandbox
 * (`CodeSandboxHost`/`CodeSandboxClient`) — this function is purely a new *caller* of that
 * public surface, never a protocol change. A hung/errored/malformed-output script halts the
 * pipeline exactly like a failed built-in tool step, per DUDE_PRD.md §21 Item 2.
 */
export function runUserScriptStep(sandbox: SandboxRunner, script: UserScriptDefinition, input: PipelineValue): Promise<PipelineStepResult> {
  return new Promise((resolve) => {
    const code = buildScriptSource(script, input);

    sandbox.run(code, script.timeoutMs, (event: SandboxEvent) => {
      switch (event.kind) {
        case 'log':
          return; // diagnostic-only; not surfaced through PipelineStepResult

        case 'result': {
          if (event.value === null || event.value === 'undefined') {
            resolve({ ok: false, error: { message: 'Script did not return a value.', kind: 'invalid-input' } });
            return;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(event.value);
          } catch {
            resolve({ ok: false, error: { message: 'Script did not return a JSON-serializable value.', kind: 'invalid-input' } });
            return;
          }

          const producedType = script.produces[0];
          if (!producedType || !matchesDeclaredShape(producedType, parsed)) {
            resolve({
              ok: false,
              error: {
                message: `Script's output didn't match its declared type (${producedType ?? 'none declared'}).`,
                kind: 'invalid-input',
              },
            });
            return;
          }

          resolve({ ok: true, output: { type: producedType, value: parsed } as PipelineValue });
          return;
        }

        case 'error':
          resolve({ ok: false, error: { message: event.message, kind: 'execution-error' } });
          return;

        case 'terminated': {
          const message =
            event.reason === 'timeout'
              ? `Script exceeded its ${script.timeoutMs}ms limit.`
              : event.reason === 'log-flood'
                ? 'Script produced excessive console output.'
                : 'Script run was cancelled.';
          resolve({ ok: false, error: { message, kind: 'execution-error' } });
          return;
        }
      }
    });
  });
}
