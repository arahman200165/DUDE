import { PipelineStep, PipelineStepResult } from "@dude/contracts/shared/models/pipeline-step.model";
import { generatePkcePair } from "./pkce-generator-logic.js";

/**
 * Pipeline-step adapter for the PKCE Generator — a generator-style step with no meaningful
 * input (DUDE_PRD.md §21 Item 2's pipeline batch migration guidance): the piped value is
 * ignored and a fresh RFC 7636 pair is generated using the tool's own defaults (64-character
 * verifier, S256). A pipeline step carries one value, so this surfaces the `code_verifier` —
 * the higher-entropy secret a client must retain — as the outgoing `text`; the `code_challenge`
 * and `method` are still computable downstream from it, but are not carried forward here.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['json'],
  produces: ['text'],
  async run(): Promise<PipelineStepResult> {
    const pair = await generatePkcePair();
    return { ok: true, output: { type: 'text', value: pair.verifier } };
  },
};
