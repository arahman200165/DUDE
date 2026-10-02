import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { JwtDecodeResult } from "../jwt/jwt-decode.js";
import { TokenResponseInspection, inspectAuthorizationCallback, inspectTokenResponse } from "./oauth-playground-logic.js";

/** `JwtDecodeResult.expiry` carries a live `expiresAt: Date` for the 'valid'/'expired' cases; `PipelineValue` json payloads must be JSON-serializable (see `pipeline-step.model.ts`), so it's converted to an ISO string here. */
function serializeDecodedJwt(decoded: JwtDecodeResult | undefined): unknown {
  if (!decoded || !decoded.ok || decoded.expiry.kind === 'no-claim') return decoded;
  return { ...decoded, expiry: { ...decoded.expiry, expiresAt: decoded.expiry.expiresAt.toISOString() } };
}

function serializeTokenInspection(inspection: TokenResponseInspection): unknown {
  return {
    ...inspection,
    accessTokenDecoded: serializeDecodedJwt(inspection.accessTokenDecoded),
    idTokenDecoded: serializeDecodedJwt(inspection.idTokenDecoded),
  };
}

/**
 * Pipeline-step adapter for the OAuth 2.0 Playground tool. Only implements the "inspect" side --
 * a `url` value is treated as an authorization callback URL, and a `text` value as a pasted
 * token-response JSON body -- since every "build a request" function needs several independent
 * required fields (endpoint, client ID, redirect URI, ...) with no sensible single-value default.
 *
 * Drift from the declared `io` in tool-definitions.ts: it lists `produces: ['url', 'json']`,
 * covering both the "build" (url) and "inspect" (json) directions. Since this adapter only
 * implements the inspect direction, it honestly produces just `['json']`. Device-authorization
 * response inspection (`inspectDeviceAuthorizationResponse`) is also out of scope for the same
 * per-step-params reason `duplicate-finder.pipeline-step.ts` documents for its own narrowed mode.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text', 'url'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type === 'url') {
      const result = inspectAuthorizationCallback(input.value);
      return result.ok ? { ok: true, output: { type: 'json', value: result.value } } : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
    }

    if (input.type !== 'text') {
      return { ok: false, error: { message: 'OAuth 2.0 Playground expects text or url input.', kind: 'invalid-input' } };
    }

    const result = inspectTokenResponse(input.value);
    return result.ok
      ? { ok: true, output: { type: 'json', value: serializeTokenInspection(result.value) } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
