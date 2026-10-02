import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { bytesToHex } from "../../shared/utils/byte-codec.js";
import { ParseResult, parsePemOrDerFile, parsePemOrHexDer } from "./pem-der-logic.js";

function toJson(result: Extract<ParseResult, { ok: true }>): unknown {
  if (result.kind === 'pem') {
    return { kind: 'pem', blocks: result.blocks.map((block) => ({ type: block.type, derHex: bytesToHex(block.der), tree: block.tree })) };
  }
  return { kind: 'der', derHex: bytesToHex(result.der), tree: result.tree };
}

/**
 * Pipeline-step adapter for the PEM / DER Inspector & Converter. Auto-detects
 * PEM text vs. hex-encoded DER for `text` input (matching the tool's own
 * `parsePemOrHexDer`), and PEM text vs. raw binary DER for `file` input. The
 * raw `Uint8Array` DER is exposed as hex (JSON-safe) rather than the live
 * bytes, per `PipelineValue`'s JSON-serializable-by-construction convention.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'file'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    let result: ParseResult;

    if (input.type === 'text') {
      result = parsePemOrHexDer(input.value);
    } else if (input.type === 'file') {
      let bytes: Uint8Array;
      try {
        const binary = atob(input.value.base64.trim());
        bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      } catch {
        return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
      }
      result = parsePemOrDerFile(bytes);
    } else {
      return { ok: false, error: { message: 'PEM / DER Inspector expects text or file input.', kind: 'invalid-input' } };
    }

    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: toJson(result) } };
  },
};
