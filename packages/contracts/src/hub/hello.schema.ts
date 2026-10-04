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
  /** Device sync reads accept category filters. Absent on older Hubs. */
  syncCategoryFiltering: Type.Optional(Type.Literal(true)),
  tls: Type.Object({
    spkiSha256: SpkiSha256,
    nextSpkiSha256: Type.Union([SpkiSha256, Type.Null()]),
    /** Reverse-proxy leaf pins (active plus staged next) registered with `dude-hub tls proxy-pin`. Absent on Hubs that predate proxy pins. */
    proxySpkiSha256: Type.Optional(Type.Array(SpkiSha256)),
  }),
  /** Authority epoch of this Hub (positive integer, 1 until an authority transfer raises it). Absent on Hubs that predate authority epochs. */
  authorityEpoch: Type.Optional(Type.Integer({ minimum: 1 })),
  /** `active` while this Hub is the authoritative one; `transferred` once its authority moved to another Hub. Absent on Hubs that predate authority epochs. */
  authorityState: Type.Optional(Type.Union([Type.Literal('active'), Type.Literal('transferred')])),
});
export type HelloResponse = Static<typeof HelloResponse>;
