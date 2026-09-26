import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from '../../../testing/property-harness';
import { inspectFile } from './file-inspector-logic';

describe('file inspector properties', () => {
  it('preserves file metadata and bounds sample strings', () => {
    invariant(([bytes, name, mime]) => inspectFile(bytes, name, mime), fc.tuple(fc.uint8Array({ maxLength: 2048 }), fc.string(), fc.option(fc.string(), { nil: null })), (report, [bytes, name, mime]) => {
      expect(report.fileName).toBe(name);
      expect(report.fileSize).toBe(bytes.length);
      expect(report.declaredMime).toBe(mime);
      return report.sampleStrings.length <= 10 && report.entropy >= 0 && report.entropy <= 8;
    });
  });
});
