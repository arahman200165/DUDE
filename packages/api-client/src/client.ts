import { Value } from 'typebox/value';
import type { TSchema, Static } from 'typebox';
import { HUB_API_PREFIX, HelloResponse, ErrorEnvelope, checkProtocolCompatibility } from '@dude/contracts/hub';
import type { ProtocolCompatibility } from '@dude/contracts/hub';
import type { HubRequest, HubTransport } from './transport.js';
import { HubApiError, HubProtocolError } from './errors.js';

export interface HubClientOptions {
  clientProtocol: number;
  minHubProtocol: number;
}

export interface HubClient {
  hello(): Promise<HelloResponse>;
  compatibility(hello: Pick<HelloResponse, 'protocolVersion' | 'minClientProtocol'>): ProtocolCompatibility;
}

export function createHubClient(transport: HubTransport, opts: HubClientOptions): HubClient {
  /** Sends a request, maps non-2xx ErrorEnvelopes to HubApiError and validates success bodies against the schema. */
  async function call<S extends TSchema>(schema: S, req: HubRequest): Promise<Static<S>> {
    const res = await transport.request(req);
    if (res.status < 200 || res.status >= 300) {
      if (Value.Check(ErrorEnvelope, res.body)) throw new HubApiError(res.status, res.body.error.code, res.body.error.message);
      throw new HubProtocolError(`Hub returned HTTP ${res.status} without a valid error envelope`, res.status);
    }
    if (!Value.Check(schema, res.body)) throw new HubProtocolError(`Hub response for ${req.method} ${req.path} failed schema validation`, res.status);
    return res.body as Static<S>;
  }

  return {
    hello: () => call(HelloResponse, { method: 'GET', path: `${HUB_API_PREFIX}/hello` }),
    compatibility: (hello) => checkProtocolCompatibility(hello, { protocolVersion: opts.clientProtocol, minHubProtocol: opts.minHubProtocol }),
  };
}
