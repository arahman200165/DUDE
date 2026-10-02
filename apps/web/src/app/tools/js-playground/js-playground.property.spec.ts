import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { applySandboxEvent, EMPTY_JS_PLAYGROUND_STATE } from "@dude/tool-engine/tools/js-playground/js-playground-session";
import type { SandboxEvent } from "@dude/contracts/sandbox/code-sandbox-protocol";

describe('JavaScript playground reducer properties', () => {
  it('never throws for any sandbox event', () => {
    const event = fc.oneof(
      fc.record({ kind: fc.constant('log' as const), requestId: fc.string(), level: fc.constantFrom('log','info','warn','error' as const), args: fc.array(fc.string()) }),
      fc.record({ kind: fc.constant('result' as const), requestId: fc.string(), value: fc.option(fc.string(), { nil: null }), durationMs: fc.nat() }),
      fc.record({ kind: fc.constant('error' as const), requestId: fc.string(), message: fc.string(), source: fc.constantFrom('thrown','syntax' as const) }),
      fc.record({ kind: fc.constant('terminated' as const), requestId: fc.string(), reason: fc.constantFrom('timeout','cancelled','runtime-error' as const) }),
    ) as fc.Arbitrary<SandboxEvent>;
    neverThrows((value) => applySandboxEvent(EMPTY_JS_PLAYGROUND_STATE, value), event, { assertShape: (value) => expect(value).toHaveProperty('logs') });
  });
});
