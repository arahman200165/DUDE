import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { createZip } from "./archive-tool-zip.js";

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
 * Pipeline-step adapter for the Archive Creator / Extractor tool. `PipelineValue`'s `file` shape
 * carries exactly one file, so the only cardinality-honest direction is "create": wrap the single
 * input file as one entry in a new ZIP archive. The "extract" direction is out of scope here --
 * an archive's entries are inherently zero-or-more files, which no current `DudeDataType` can
 * carry (there is no "list of files" type; `table`/`json` could list metadata but not raw file
 * bytes per entry) -- and only ZIP is used, matching the component's own default format.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['file'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'Archive Creator / Extractor expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(input.value.base64);
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    try {
      const zipped = createZip([{ name: input.value.name, data: bytes }]);
      return {
        ok: true,
        output: { type: 'file', value: { name: 'archive.zip', mimeType: 'application/zip', base64: bytesToBase64(zipped) } },
      };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : 'Could not build the archive.', kind: 'execution-error' } };
    }
  },
};
