import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { sanitizeEditorHtml } from "./rich-text-export.js";

/**
 * Pipeline-step adapter for the Rich Text Editor tool. The editor itself is a WYSIWYG surface
 * with no single pure "transform" beyond the one genuine text-in/text-out pure function it does
 * have: `sanitizeEditorHtml`, the DOMPurify pass every HTML string goes through before touching
 * `[innerHTML]`, storage, or export (per PRD Section 31). This step exposes exactly that —
 * sanitizing an arbitrary HTML string — rather than the Markdown-export or clipboard-paste paths,
 * which aren't pure document-in/document-out transforms.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Rich Text Editor expects text input.', kind: 'invalid-input' } };
    }

    try {
      return { ok: true, output: { type: 'text', value: sanitizeEditorHtml(input.value) } };
    } catch (error) {
      return {
        ok: false,
        error: { message: error instanceof Error ? error.message : 'Failed to sanitize HTML.', kind: 'execution-error' },
      };
    }
  },
};
