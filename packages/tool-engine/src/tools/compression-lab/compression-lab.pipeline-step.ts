import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { compressBytes } from "./compression-lab-transform.js";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Chunked to avoid blowing the call stack via `String.fromCharCode(...bytes)` on a large array. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/**
 * Pipeline-step adapter for the Compression Lab tool. Always compresses with gzip -- matching the
 * component's own default direction/format -- until per-step params ship (DUDE_PRD.md §21 Item 2,
 * v1.1), the same convention `base64.pipeline-step.ts` uses for its own fixed direction.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'file'],
  produces: ['file'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    let bytes: Uint8Array;
    let baseName = 'output';

    if (input.type === 'text') {
      bytes = new TextEncoder().encode(input.value);
    } else if (input.type === 'file') {
      try {
        bytes = base64ToBytes(input.value.base64);
      } catch {
        return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
      }
      baseName = input.value.name.replace(/\.[^./]+$/, '') || 'output';
    } else {
      return { ok: false, error: { message: 'Compression Lab expects text or file input.', kind: 'invalid-input' } };
    }

    try {
      const compressed = await compressBytes(bytes, 'gzip');
      return {
        ok: true,
        output: { type: 'file', value: { name: `${baseName}.gz`, mimeType: 'application/gzip', base64: bytesToBase64(compressed) } },
      };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Could not compress this input.', kind: 'execution-error' } };
    }
  },
};
