import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { buildDomTree } from './dom-tree-logic';

/**
 * Pipeline-step adapter for the DOM Tree Viewer tool — parses HTML and produces a structural
 * tree of elements, attributes, text nodes, and comments as `json`.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'DOM Tree Viewer expects text input.', kind: 'invalid-input' } };
    }

    const result = buildDomTree(input.value);
    return result.ok
      ? { ok: true, output: { type: 'json', value: { nodes: result.nodes } } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
