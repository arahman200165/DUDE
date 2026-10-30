import Type, { type Static } from 'typebox';

/**
 * The Hub machine's power policy (32-SS1, Milestone 851, PD-142). A Hub machine that sleeps or hibernates drops the tunnel and misses
 * scheduled backups, so the policy is "never sleep and never hibernate while on AC power". The Hub only checks it (`powercfg`, Windows
 * only) and changes it through the elevated admin pipe (`dude-hub power status|apply|revert`, two-step preview and confirm); there is
 * NO HTTP route that reads or changes it. The read-only owner view is the `power` component of `GET /api/v1/provisioning`.
 *
 * Verdicts: `ok` neither the AC sleep timeout nor the AC hibernate timeout is set; `needs-change` at least one is; `unsupported` this
 * deployment cannot read or change it (not Windows, no `powercfg`: a Docker Hub, by design); `unknown` `powercfg` ran but its output
 * could not be read (an unfamiliar Windows build, a locked-down policy).
 */
export const HUB_POWER_VERDICTS = ['ok', 'needs-change', 'unsupported', 'unknown'] as const;
export type HubPowerVerdict = (typeof HUB_POWER_VERDICTS)[number];

/** The two AC settings the policy covers. `powercfg /change <name>-timeout-ac <minutes>`; 0 means never. */
export const HUB_POWER_SETTINGS = ['standby', 'hibernate'] as const;
export type HubPowerSetting = (typeof HUB_POWER_SETTINGS)[number];

/** The admin-pipe confirmation actions of `power apply` and `power revert` (single-use tokens bound to the observed state). */
export const POWER_APPLY_ACTION = 'power.apply';
export const POWER_REVERT_ACTION = 'power.revert';
/** Changing the active power plan is `system-config`. */
export const POWER_CONSEQUENCE_CLASS = ['system-config'] as const;

const Instant = Type.String({ minLength: 1, maxLength: 40 });
const Minutes = Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]);

/** What a check found plus what the Hub remembers about the policy (no path, no value beyond minutes). */
export const HubPowerStatus = Type.Object({
  verdict: Type.Unsafe<HubPowerVerdict>({ type: 'string', enum: [...HUB_POWER_VERDICTS] }),
  checkedAt: Instant,
  /** The AC "sleep after" timeout in minutes (0 = never); null when it could not be read. */
  sleepAcMinutes: Minutes,
  /** The AC "hibernate after" timeout in minutes (0 = never); null when the setting does not exist on this machine or could not be read. */
  hibernateAcMinutes: Minutes,
  /** Sleep states `powercfg /a` reports as available, as `S1`, `S2`, `S3` and `S0ix` (informational). */
  sleepStates: Type.Array(Type.String({ maxLength: 8 }), { maxItems: 8 }),
  /** The owner ran `power apply` and has not reverted it. */
  applied: Type.Boolean(),
  /** The policy was ok (or applied) and a later check found it changed, or it was never ok while a tunnel or backup schedule exists. */
  regressed: Type.Boolean(),
  /** The owner reverted the policy on purpose: no regression notice is raised until they apply it again. */
  optedOut: Type.Boolean(),
});
export type HubPowerStatus = Static<typeof HubPowerStatus>;
