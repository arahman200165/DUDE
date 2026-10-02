import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { parseWwwAuthenticateChallenge } from "./http-digest-auth-helper-logic.js";

/**
 * Pipeline-step adapter for the HTTP Digest Auth Helper tool. Computing a full Digest
 * Authorization header (`computeDigestResponse`) needs several independent freeform fields at
 * once — username, password, HTTP method, request URI, and the challenge itself — which
 * doesn't fit a single piped value, so this step only wraps the tool's other pure function,
 * `parseWwwAuthenticateChallenge`: parsing a `WWW-Authenticate: Digest ...` challenge into its
 * directives (realm/nonce/qop/opaque/algorithm). That naturally produces a `json` value, which
 * is a drift from the tool's declared `text -> text` io (there is no single-input "text" shape
 * that captures a parsed challenge honestly).
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'HTTP Digest Auth Helper expects text input.', kind: 'invalid-input' } };
    }

    const result = parseWwwAuthenticateChallenge(input.value);
    return result.ok
      ? { ok: true, output: { type: 'json', value: result.value } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
