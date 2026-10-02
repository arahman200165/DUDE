import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { computeFileHash } from "@dude/crypto/hash-compute";

/**
 * Pipeline-step adapter for the File Hash Generator. Always computes a
 * single SHA-256 digest — the tool's UI lets several algorithms be selected
 * at once, but a pipeline step produces one `text` value, and SHA-256 is the
 * tool's own default algorithm. Runs the underlying digest directly on the
 * main thread rather than dispatching to `file-hash.worker.ts`, per the
 * pipeline-step migration's worker policy (small/no perf cost here relative
 * to the Worker postMessage round-trip).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'File Hash Generator expects file input.', kind: 'invalid-input' } };
    }

    let buffer: ArrayBuffer;
    try {
      const binary = atob(input.value.base64.trim());
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      buffer = bytes.buffer;
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    try {
      const hex = await computeFileHash(buffer, 'SHA-256');
      return { ok: true, output: { type: 'text', value: hex } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Hashing failed.', kind: 'execution-error' } };
    }
  },
};
