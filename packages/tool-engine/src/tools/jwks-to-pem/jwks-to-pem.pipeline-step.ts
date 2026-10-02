import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { convertAllToPem, parseJwksKeys } from "./jwks-to-pem-logic.js";

/**
 * Pipeline-step adapter for the JWKS → Public Keys tool. Accepts either a raw JWKS `text`
 * document or an already-parsed `json` value, converts every key to a SPKI PEM, and joins the
 * successful PEMs into one `text` value (blank-line separated) — a pipeline step carries a
 * single value, so per-key success/failure detail from the tool's own table view is collapsed.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'json'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    const text = input.type === 'json' ? JSON.stringify(input.value) : input.type === 'text' ? input.value : null;
    if (text === null) {
      return { ok: false, error: { message: 'JWKS → Public Keys expects text or JSON input.', kind: 'invalid-input' } };
    }

    const parsed = parseJwksKeys(text);
    if (!parsed.ok) {
      return { ok: false, error: { message: parsed.error, kind: 'invalid-input' } };
    }

    const converted = await convertAllToPem(parsed.keys);
    const pems = converted.filter((entry): entry is typeof entry & { ok: true } => entry.ok).map((entry) => entry.pem);

    if (pems.length === 0) {
      const firstError = converted.find((entry): entry is typeof entry & { ok: false } => !entry.ok);
      return {
        ok: false,
        error: { message: firstError?.error ?? 'No key could be converted to PEM.', kind: 'execution-error' },
      };
    }

    return { ok: true, output: { type: 'text', value: pems.join('\n\n') } };
  },
};
