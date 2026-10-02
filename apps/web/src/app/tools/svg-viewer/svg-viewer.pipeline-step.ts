import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { formatSvg } from './svg-tools';

/**
 * Pipeline-step adapter for the SVG Viewer / Formatter / Optimizer tool. Always formats (pretty-
 * prints) — until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step can't
 * select the minify/optimize modes. A `file` input is decoded as UTF-8 text (SVG is XML text,
 * not a binary raster format), matching how the component reads an uploaded `.svg` file.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'file'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    let source: string;
    if (input.type === 'text') {
      source = input.value;
    } else if (input.type === 'file') {
      try {
        const binary = atob(input.value.base64.trim());
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return { ok: false, error: { message: 'File content is not valid UTF-8 Base64.', kind: 'invalid-input' } };
      }
    } else {
      return { ok: false, error: { message: 'SVG Viewer expects text or file input.', kind: 'invalid-input' } };
    }

    const result = formatSvg(source);
    return result.ok
      ? { ok: true, output: { type: 'text', value: result.output } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
