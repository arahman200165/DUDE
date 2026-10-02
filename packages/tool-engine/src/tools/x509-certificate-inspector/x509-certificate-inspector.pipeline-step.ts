import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { ParseCertificateResult, parseCertificateBytes, parseCertificateText } from "./x509-logic.js";

function toJson(result: Extract<ParseCertificateResult, { ok: true }>): unknown {
  const { fields, fingerprintSha1, fingerprintSha256 } = result.certificate;
  return {
    fields: { ...fields, notBefore: fields.notBefore.toISOString(), notAfter: fields.notAfter.toISOString() },
    fingerprintSha1,
    fingerprintSha256,
  };
}

/**
 * Pipeline-step adapter for the X.509 Certificate Inspector. Auto-detects
 * PEM text vs. hex-encoded DER for `text` input, and PEM text vs. raw binary
 * DER for `file` input, matching the tool's own `parseCertificateText`/
 * `parseCertificateFile`. `notBefore`/`notAfter` are converted to ISO
 * strings since `PipelineValue` json payloads are JSON-serializable by
 * construction (see `pipeline-step.model.ts`), unlike the tool's own `Date`
 * fields.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'file'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    let result: ParseCertificateResult;

    if (input.type === 'text') {
      result = await parseCertificateText(input.value);
    } else if (input.type === 'file') {
      let bytes: Uint8Array;
      try {
        const binary = atob(input.value.base64.trim());
        bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      } catch {
        return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
      }
      result = await parseCertificateBytes(bytes);
    } else {
      return { ok: false, error: { message: 'X.509 Certificate Inspector expects text or file input.', kind: 'invalid-input' } };
    }

    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: toJson(result) } };
  },
};
