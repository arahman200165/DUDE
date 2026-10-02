import Type, { type Static } from 'typebox';
import { HUB_SERVICE_ID } from './protocol.js';

const SpkiSha256 = Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' });

export const HelloResponse = Type.Object({
  service: Type.Literal(HUB_SERVICE_ID),
  protocolVersion: Type.Integer({ minimum: 1 }),
  minClientProtocol: Type.Integer({ minimum: 1 }),
  hubVersion: Type.String(),
  hubInstanceId: Type.String({ pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' }),
  environmentId: Type.Union([Type.String(), Type.Null()]),
  bootstrapped: Type.Boolean(),
  tls: Type.Object({
    spkiSha256: SpkiSha256,
    nextSpkiSha256: Type.Union([SpkiSha256, Type.Null()]),
  }),
});
export type HelloResponse = Static<typeof HelloResponse>;
