import Type, { type Static } from 'typebox';

/** What the Hub observed about the request's source address. The address itself is never returned or stored. */
export const REACHABILITY_SCOPES = ['public', 'private', 'cgnat', 'link-local', 'unique-local', 'loopback', 'unknown'] as const;
export type ReachabilityScope = (typeof REACHABILITY_SCOPES)[number];

export const ReachabilityEchoResponse = Type.Object({
  observed: Type.Object({
    scope: Type.Union([Type.Literal('public'), Type.Literal('private'), Type.Literal('cgnat'), Type.Literal('link-local'), Type.Literal('unique-local'), Type.Literal('loopback'), Type.Literal('unknown')]),
    viaProxy: Type.Boolean(),
  }),
  host: Type.String(),
  hostMatchesConfiguredName: Type.Boolean(),
  /** True only when the Hub saw a public source address on a configured public name; it is then recorded. */
  verified: Type.Boolean(),
  reason: Type.String(),
  at: Type.String(),
});
export type ReachabilityEchoResponse = Static<typeof ReachabilityEchoResponse>;
