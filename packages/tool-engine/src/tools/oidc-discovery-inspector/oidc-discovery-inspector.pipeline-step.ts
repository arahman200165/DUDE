import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseDiscoveryDocument } from "./oidc-discovery-inspector-logic.js";

/**
 * Pipeline-step adapter for the OpenID Connect Discovery Document Inspector tool. Purely
 * validates a pasted `.well-known/openid-configuration` document against OIDC Discovery 1.0's
 * required/recommended fields — the underlying logic never fetches anything itself, so no
 * network access is involved despite the tool inspecting a "discovery" document.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'json'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    const text = input.type === 'json' ? JSON.stringify(input.value) : input.type === 'text' ? input.value : null;
    if (text === null) {
      return { ok: false, error: { message: 'OIDC Discovery Document Inspector expects text or JSON input.', kind: 'invalid-input' } };
    }

    const result = parseDiscoveryDocument(text);
    if (!result.ok) {
      return { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    return { ok: true, output: { type: 'json', value: { doc: result.doc, findings: result.findings } } };
  },
};
