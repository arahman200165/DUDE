import fc from 'fast-check';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { analyzeByteFrequency } from "@dude/tool-engine/tools/byte-frequency-analyzer/byte-frequency-analyzer-logic";

describe('analyzeByteFrequency properties', () => {
  it('reports a complete histogram whose counts sum to the input length', () => {
    const inputs = fc.uint8Array({ maxLength: 1024 });
    neverThrows(analyzeByteFrequency, inputs, { assertShape: (result) => expect((result as ReturnType<typeof analyzeByteFrequency>).histogram).toHaveLength(256) });
    invariant(analyzeByteFrequency, inputs, (report, bytes) => report.histogram.reduce((sum, count) => sum + count, 0) === bytes.length && report.byteLength === bytes.length && report.distinctByteValues <= 256);
  });
});
