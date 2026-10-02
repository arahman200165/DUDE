import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { LoremFormat, LoremOptions, LoremSource, LoremUnit, generateLorem } from "./lorem-ipsum-generate.js";

const DEFAULT_OPTIONS: LoremOptions = { source: 'classic', unit: 'paragraphs', count: 3, format: 'plain' };

const SOURCES: readonly LoremSource[] = ['classic', 'faker'];
const UNITS: readonly LoremUnit[] = ['words', 'sentences', 'paragraphs'];
const FORMATS: readonly LoremFormat[] = ['plain', 'html-list', 'markdown-list'];

/**
 * Pipeline-step adapter for the Lorem Ipsum & Placeholder Text Generator tool — a generator with
 * no meaningful "document" input, matching its declared `io.accepts: ['json']`: the input, if
 * given, is treated as a partial `LoremOptions` override merged onto the component's own
 * defaults, rather than text to transform.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['json'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'json') {
      return { ok: false, error: { message: 'Lorem Ipsum Generator expects a JSON options object.', kind: 'invalid-input' } };
    }

    try {
      const options = mergeOptions(input.value);
      return { ok: true, output: { type: 'text', value: generateLorem(options) } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : String(error), kind: 'execution-error' } };
    }
  },
};

function mergeOptions(raw: unknown): LoremOptions {
  const partial = (raw ?? {}) as Partial<LoremOptions>;
  return {
    source: SOURCES.includes(partial.source as LoremSource) ? (partial.source as LoremSource) : DEFAULT_OPTIONS.source,
    unit: UNITS.includes(partial.unit as LoremUnit) ? (partial.unit as LoremUnit) : DEFAULT_OPTIONS.unit,
    count: typeof partial.count === 'number' && Number.isFinite(partial.count) ? partial.count : DEFAULT_OPTIONS.count,
    format: FORMATS.includes(partial.format as LoremFormat) ? (partial.format as LoremFormat) : DEFAULT_OPTIONS.format,
  };
}
