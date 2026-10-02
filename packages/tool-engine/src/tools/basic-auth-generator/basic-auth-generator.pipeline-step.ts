import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { decodeBasicAuthHeader } from "./basic-auth-generator-logic.js";

/**
 * Pipeline-step adapter for the Basic Auth Header Generator tool. Always decodes — building a
 * header needs an independent username *and* password (two freeform secrets), which doesn't
 * fit a single piped value, whereas decoding an existing `Authorization: Basic ...` header (or
 * its bare Base64 payload) back to `username:password` is a clean single-input transform, and
 * matches the decode-by-default direction already established for the Base64 tool's own step.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Basic Auth Header Generator expects text input.', kind: 'invalid-input' } };
    }

    const result = decodeBasicAuthHeader(input.value);
    return result.ok
      ? { ok: true, output: { type: 'text', value: `${result.value.username}:${result.value.password}` } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
