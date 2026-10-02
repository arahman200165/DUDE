import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { linkChain, splitPemBundle, verifyChain } from "./certificate-chain-logic.js";

/**
 * Pipeline-step adapter for the Certificate Chain Viewer & Builder. Splits a
 * multi-certificate PEM bundle, orders it leaf-first via the same
 * issuer/subject heuristic the tool's "Auto-link" button uses, and verifies
 * it as a signing chain — matching the tool's own split -> auto-link ->
 * verify flow, collapsed into one step.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'file'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    let bundleText: string;

    if (input.type === 'text') {
      bundleText = input.value;
    } else if (input.type === 'file') {
      try {
        bundleText = atob(input.value.base64.trim());
      } catch {
        return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
      }
    } else {
      return { ok: false, error: { message: 'Certificate Chain Tools expects text or file input.', kind: 'invalid-input' } };
    }

    const split = splitPemBundle(bundleText);
    if (!split.ok) {
      return { ok: false, error: { message: split.error, kind: 'invalid-input' } };
    }

    const { ordered, warnings } = linkChain(split.entries);
    const verification = ordered.length >= 2 ? verifyChain(ordered.map((entry) => entry.pem)) : null;

    return {
      ok: true,
      output: {
        type: 'json',
        value: {
          certificates: ordered.map((entry) => ({ pem: entry.pem, subject: entry.fields.subject, issuer: entry.fields.issuer })),
          warnings,
          verification,
        },
      },
    };
  },
};
