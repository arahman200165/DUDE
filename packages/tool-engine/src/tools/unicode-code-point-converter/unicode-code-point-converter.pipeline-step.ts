import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { formatCodePoint, parseBulkCodePoints, parseCodePointInput } from "./code-point-convert.js";

/**
 * Pipeline-step adapter for the Unicode Code Point Converter tool.
 *
 * Drift from the declared `io` in tool-definitions.ts: it lists `produces: ['text']`, but the
 * underlying pure functions never return a bare string — a single token formats to a multi-field
 * notations record (`formatCodePoint`), and bulk input formats to an array of per-token records
 * (`parseBulkCodePoints`). This adapter honestly produces `json` for both.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Unicode Code Point Converter expects text input.', kind: 'invalid-input' } };
    }

    const trimmed = input.value.trim();
    if (trimmed === '') {
      return {
        ok: false,
        error: { message: 'Unicode Code Point Converter expects a code point, character, or bulk list.', kind: 'invalid-input' },
      };
    }

    const isBulk = /[\n,]/.test(trimmed);
    if (!isBulk) {
      const codePoint = parseCodePointInput(trimmed);
      if (codePoint === null) {
        return { ok: false, error: { message: `"${trimmed}" is not a recognized code point notation.`, kind: 'invalid-input' } };
      }
      return { ok: true, output: { type: 'json', value: formatCodePoint(codePoint) } };
    }

    const entries = parseBulkCodePoints(trimmed);
    if (entries.length === 0 || entries.every((entry) => entry.notations === null)) {
      return { ok: false, error: { message: 'No recognized code points were found in the bulk input.', kind: 'invalid-input' } };
    }
    return { ok: true, output: { type: 'json', value: entries } };
  },
};
