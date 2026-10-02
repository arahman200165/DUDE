import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { analyzeFileEntropy } from "@dude/tool-engine/tools/file-entropy-analyzer/file-entropy-analyzer-logic";

describe('file entropy properties', () => {
  it('reports the input size and bounded entropy', () => {
    invariant((bytes) => analyzeFileEntropy(bytes), fc.uint8Array({ maxLength: 1024 }), (report, bytes) => {
      expect(report.byteLength).toBe(bytes.length);
      return report.overallEntropy >= 0 && report.overallEntropy <= 8 && report.windows.every((window) => window.entropy >= 0 && window.entropy <= 8);
    });
  });
});
