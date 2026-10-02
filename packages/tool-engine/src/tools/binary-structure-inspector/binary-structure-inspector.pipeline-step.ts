import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { StructFieldDef, parseStruct } from "./binary-structure-inspector-logic.js";

/**
 * Pipeline-step adapter for the Binary Structure Inspector tool. Parses using the component's
 * own default field layout (a little-endian uint32 "magic" followed by a uint16 "version") --
 * until per-step params ship (DUDE_PRD.md §21 Item 2, v1.1), a pipeline step cannot accept a
 * custom user-defined field list.
 */
const DEFAULT_FIELDS: readonly StructFieldDef[] = [
  { name: 'magic', type: 'uint32', length: 0, endianness: 'LE' },
  { name: 'version', type: 'uint16', length: 0, endianness: 'LE' },
];

export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'Binary Structure Inspector expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(input.value.base64.trim()), (char) => char.charCodeAt(0));
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    const result = parseStruct(bytes, DEFAULT_FIELDS);
    if (result.error) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return {
      ok: true,
      output: {
        type: 'table',
        value: {
          columns: ['name', 'type', 'offset', 'size', 'value'],
          rows: result.fields.map((f) => [f.name, f.type, f.offset, f.size, f.value]),
        },
      },
    };
  },
};
