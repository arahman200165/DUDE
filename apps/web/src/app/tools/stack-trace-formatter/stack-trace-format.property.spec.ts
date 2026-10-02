import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { formatStackTrace } from "@dude/tool-engine/tools/stack-trace-formatter/stack-trace-format";

describe('stack trace formatter properties', () => {
  it('preserves line count for all explicit language modes', () => {
    invariant(
      ([text, mode]: [string, 'java' | 'dotnet' | 'javascript' | 'python']) => formatStackTrace(text, mode),
      fc.tuple(fc.string(), fc.constantFrom('java', 'dotnet', 'javascript', 'python')),
      (result, [text]) => result.trace.lines.length === text.split('\n').length,
    );
  });

  it('never throws in automatic detection for arbitrary text', () => {
    neverThrows((text: string) => formatStackTrace(text, 'auto'), fc.string());
  });
});
