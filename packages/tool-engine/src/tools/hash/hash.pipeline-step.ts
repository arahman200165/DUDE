import { PipelineStep, PipelineStepContext, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { HashOutput, computeHash } from "@dude/crypto/hash-compute";
import { HashComputePayload } from "./hash-compute-payload.js";

/**
 * Pipeline-step adapter for the Hash Generator tool. Always computes SHA-256. Until per-step
 * params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot select a different
 * algorithm. When the runner offers `context.offload` (Phase 26 Item 13), it hashes in the tool's
 * own `hash-compute.worker.ts` so a large input doesn't freeze the tab. Otherwise (unit tests) it
 * computes inline with the identical shared-logic function.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue, context?: PipelineStepContext): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'Hash Generator expects text input.', kind: 'invalid-input' } };
    }

    try {
      const hex = context?.offload
        ? (
            await context.offload<HashComputePayload, readonly HashOutput[]>(
              "hash/hash-compute.worker",
              { text: input.value, algorithms: ['SHA-256'] },
            )
          )[0].hex
        : await computeHash(input.value, 'SHA-256');
      return { ok: true, output: { type: 'text', value: hex } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Failed to compute hash.', kind: 'execution-error' } };
    }
  },
};
