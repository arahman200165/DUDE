import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { octalToPermissions, permissionsToOctal, permissionsToSymbolic, symbolicToPermissions } from "./chmod-convert.js";

/**
 * Pipeline-step adapter for the chmod / Unix Permissions Converter. Auto-detects octal
 * (e.g. "755") vs. symbolic (e.g. "rwxr-xr--") input, converting to the other representation --
 * mirroring the auto-detect convention used by `jwt.pipeline-step.ts`/`pem-der-inspector.pipeline-step.ts`
 * for their own input-shape sniffing.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'chmod Converter expects text input.', kind: 'invalid-input' } };
    }

    const trimmed = input.value.trim();
    const looksOctal = /^[0-7]{3,4}$/.test(trimmed);

    if (looksOctal) {
      const parsed = octalToPermissions(trimmed);
      if (!parsed.ok) return { ok: false, error: { message: parsed.error, kind: 'invalid-input' } };
      return { ok: true, output: { type: 'text', value: permissionsToSymbolic(parsed.permissions) } };
    }

    const parsed = symbolicToPermissions(trimmed);
    if (!parsed.ok) {
      return {
        ok: false,
        error: { message: 'Enter either a 3-4 digit octal value (e.g. 755) or a 9-character symbolic string (e.g. rwxr-xr--).', kind: 'invalid-input' },
      };
    }
    return { ok: true, output: { type: 'text', value: permissionsToOctal(parsed.permissions) } };
  },
};
