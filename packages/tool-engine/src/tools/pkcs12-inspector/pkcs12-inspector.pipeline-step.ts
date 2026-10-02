import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { inspectPkcs12 } from "./pkcs12-logic.js";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Pipeline-step adapter for the PKCS#12 / PFX Inspector tool. Always uses an empty password —
 * the component's own default (`signal('')`) — since a pipeline step has no per-run prompt for a
 * secret; until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), this step can only inspect
 * unencrypted/empty-password `.p12`/`.pfx` files. A password-protected file will fail with the
 * same "wrong password" error the component itself would show.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'PKCS#12 / PFX Inspector expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(input.value.base64);
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    try {
      const result = inspectPkcs12(bytes, '');
      if (!result.ok) {
        return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
      }
      return { ok: true, output: { type: 'json', value: result.contents } };
    } catch (error) {
      return {
        ok: false,
        error: { message: error instanceof Error ? error.message : 'Failed to inspect the PKCS#12 file.', kind: 'execution-error' },
      };
    }
  },
};
