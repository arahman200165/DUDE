import Type, { type Static } from 'typebox';

/**
 * Owner read of the Hub's SaveSphere provisioning status (32-SS1, PD-118, PD-153). Credential: owner cookie or bearer session.
 * Read-only: provisioning itself runs only through the elevated `dude-hub provision` command over the local admin pipe, so no
 * route here can create, change or widen anything. The response carries a short, non-secret sentence per component, logical
 * names only (never a path outside the Hub's own layout) and presence-only secret status, never a secret value.
 */
export const HUB_PROVISIONING_PATH = '/api/v1/provisioning';

/**
 * The closed list of provisioning components, in display order. The first eight are checked by the provisioning engine today; the
 * rest are reserved for the milestones that build them (`tunnel` 836-837, `oidc` 841, `power` 851, `backup` 847 onwards). A
 * component that is not built yet is simply absent from `components`; it is never reported as a guess.
 */
export const HUB_PROVISIONING_COMPONENT_IDS = [
  'content-store', 'fts', 'vector', 'blob-store', 'cache', 'queue', 'workers', 'secrets',
  'tunnel', 'oidc', 'power', 'backup',
] as const;
export type HubProvisioningComponentId = (typeof HUB_PROVISIONING_COMPONENT_IDS)[number];

/**
 * `ready` works; `degraded` works with a problem (for example low disk); `unavailable` cannot work on this deployment and that is
 * by design (vector search in Docker), never an error; `not-configured` has not been set up yet; `needs-attention` stops the
 * component until the owner acts (a corrupt store, a secret to re-enter).
 */
export const HUB_PROVISIONING_COMPONENT_STATES = ['ready', 'degraded', 'unavailable', 'not-configured', 'needs-attention'] as const;
export type HubProvisioningComponentState = (typeof HUB_PROVISIONING_COMPONENT_STATES)[number];

/**
 * The whole picture. `not-provisioned`: no SaveSphere storage exists yet. `needs-provisioning`: storage exists but a provisioning run
 * is required (a restored data directory, a moved Hub identity, a missing directory, a secret to re-enter). `needs-attention`: some
 * component needs the owner. `degraded`: something works with a problem. `ready`: everything built works or is unavailable by design.
 */
export const HUB_PROVISIONING_OVERALL = ['not-provisioned', 'needs-provisioning', 'needs-attention', 'degraded', 'ready'] as const;
export type HubProvisioningOverall = (typeof HUB_PROVISIONING_OVERALL)[number];

export const HUB_PROVISIONING_DETAIL_MAX = 240;
export const HUB_PROVISIONING_ACTION_MAX = 200;

const Instant = Type.String({ minLength: 1, maxLength: 40 });

export const HubProvisioningComponent = Type.Object({
  id: Type.Unsafe<HubProvisioningComponentId>({ type: 'string', enum: [...HUB_PROVISIONING_COMPONENT_IDS] }),
  state: Type.Unsafe<HubProvisioningComponentState>({ type: 'string', enum: [...HUB_PROVISIONING_COMPONENT_STATES] }),
  /** One short sentence, never a secret or an absolute path. */
  detail: Type.String({ maxLength: HUB_PROVISIONING_DETAIL_MAX }),
  checkedAt: Instant,
  /** The exact next step when the state is not `ready`. */
  nextAction: Type.Optional(Type.String({ minLength: 1, maxLength: HUB_PROVISIONING_ACTION_MAX })),
});
export type HubProvisioningComponent = Static<typeof HubProvisioningComponent>;

/** Presence only: which secret purposes the Hub holds, and which it expects but lacks (after a restore). Never a value. */
export const HubProvisioningSecret = Type.Object({
  purpose: Type.String({ minLength: 1, maxLength: 64 }),
  present: Type.Boolean(),
  needsReentry: Type.Boolean(),
});
export type HubProvisioningSecret = Static<typeof HubProvisioningSecret>;

export const HubProvisioningResponse = Type.Object({
  overall: Type.Unsafe<HubProvisioningOverall>({ type: 'string', enum: [...HUB_PROVISIONING_OVERALL] }),
  checkedAt: Instant,
  /** The last provisioning run recorded in the content store; null when none. `attention` means a step failed. */
  lastRun: Type.Union([Type.Object({ at: Instant, outcome: Type.Union([Type.Literal('ok'), Type.Literal('attention')]) }), Type.Null()]),
  components: Type.Array(HubProvisioningComponent, { maxItems: 16 }),
  secrets: Type.Array(HubProvisioningSecret, { maxItems: 16 }),
  /** Commands the owner can copy and run in an elevated terminal on the Hub machine. */
  commands: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 8 }),
});
export type HubProvisioningResponse = Static<typeof HubProvisioningResponse>;
