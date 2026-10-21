import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { renderBarcodeSvg } from "./barcode-render.js";

/**
 * Pipeline-step adapter for the Barcode Generator tool. Always uses the tool's own default
 * symbology (Code 128) -- until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline
 * step can't select among the other supported symbologies. The portable `renderBarcodeSvg`
 * engine emits the SVG as text without any DOM or canvas, so this step has no host dependency;
 * the human-readable text is left off because a headless pipeline output doesn't need it.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['file'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Barcode Generator expects text input.', kind: 'invalid-input' } };
    }

    const result = renderBarcodeSvg({ symbology: 'code128', text: input.value, includeText: false });
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    const bytes = new TextEncoder().encode(result.svg);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { ok: true, output: { type: 'file', value: { name: 'barcode.svg', mimeType: 'image/svg+xml', base64: btoa(binary) } } };
  },
};
