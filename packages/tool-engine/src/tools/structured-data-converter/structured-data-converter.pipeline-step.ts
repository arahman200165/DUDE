import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertStructuredData } from "./universal-convert.js";

/**
 * Pipeline-step adapter for the Universal Structured Data Converter. The underlying
 * `convertStructuredData` supports any-format-to-any-format (json/yaml/xml/toml/csv), but a
 * pipeline step exposes one fixed direction until per-step params ship (DUDE_PRD.md §21 Item 2,
 * v1.1) — YAML source to a `json` value, mirroring the already-migrated YAML <-> JSON Converter's
 * own fixed `yaml-to-json` direction (`yaml-json.pipeline-step.ts`). Declared `io` also lists
 * `json` accepted and `text` produced (for the other four formats/directions); this adapter's
 * honest capability is narrower.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Universal Structured Data Converter expects text (YAML) input.', kind: 'invalid-input' } };
    }

    const result = convertStructuredData(input.value, 'yaml', 'json');
    if (!result.ok) {
      return { ok: false, error: { message: result.error.message, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: JSON.parse(result.output) } };
  },
};
