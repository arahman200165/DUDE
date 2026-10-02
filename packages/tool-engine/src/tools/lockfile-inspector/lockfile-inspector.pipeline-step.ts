import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseLockfile } from "./lockfile-inspector-parse.js";

/**
 * Pipeline-step adapter for the Lockfile Inspector tool. `text` input is treated as pasted
 * content with no filename (falling back to `parseLockfile`'s own content-sniffing), and `file`
 * input decodes its Base64 payload to text and passes its declared name through for the
 * filename-based sniff -- matching `lockfile-inspector.ts`'s own upload/paste modes.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'file'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    let fileName: string;
    let content: string;

    if (input.type === 'text') {
      fileName = 'pasted.txt';
      content = input.value;
    } else if (input.type === 'file') {
      fileName = input.value.name;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(input.value.base64.trim()), (char) => char.charCodeAt(0)));
      } catch {
        return { ok: false, error: { message: 'File content is not valid Base64/UTF-8 text.', kind: 'invalid-input' } };
      }
    } else {
      return { ok: false, error: { message: 'Lockfile Inspector expects text or file input.', kind: 'invalid-input' } };
    }

    const result = parseLockfile(fileName, content);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    const packages = result.packages.slice().sort((a, b) => a.name.localeCompare(b.name));
    return {
      ok: true,
      output: {
        type: 'table',
        value: {
          columns: ['name', 'version', 'dependencies', 'resolved'],
          rows: packages.map((pkg) => [pkg.name, pkg.version, pkg.dependencies.length, pkg.resolved ?? '']),
        },
      },
    };
  },
};
