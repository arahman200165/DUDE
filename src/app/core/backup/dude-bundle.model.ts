import { Project } from '../project/project.model';
import { Pipeline, PipelineStepRef, UserScriptDefinition } from '../pipeline/pipeline.model';
import { WorkspaceTemplate } from '../workspace/workspace-template.model';
import { HomePanelContent, hasHomePanelContent, mergeHomePanel, sanitizeHomePanel } from '../home-panel/home-panel.model';
import type { HomeLayoutData } from '../home-layout/home-layout-store.model';

/**
 * Browser-Safe Workspace Support (DUDE_PRD.md §21 Phase 26 Item 14): a portable JSON backup of what
 * a user builds in DUDE. Web users get a backup (browser storage can be evicted), and anyone gets
 * a manual web → desktop move ahead of Phase 59's real hand-off.
 *
 * Never included: consent decisions, `secure-local`/OS-keychain secrets, History, usage stats, and
 * any storage namespace that isn't a registered tool. The import side re-enforces all of this, so a
 * hand-edited or malicious bundle can't write outside the same boundary.
 */
export const BUNDLE_FORMAT = 'dude-bundle';
export const BUNDLE_SCHEMA_VERSION = 1;
export const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;

export interface DudeBundle {
  readonly format: typeof BUNDLE_FORMAT;
  readonly schemaVersion: typeof BUNDLE_SCHEMA_VERSION;
  readonly exportedAt: string;
  readonly projects: readonly Project[];
  readonly workspaceTemplates: readonly WorkspaceTemplate[];
  readonly pipelines: readonly Pipeline[];
  readonly userScripts: readonly UserScriptDefinition[];
  /** `toolId → storage key → raw JSON string`, from `local` storage only, never a tool's text input. */
  readonly toolPreferences: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Opt-in at export time. `toolId → its declared text input`. */
  readonly toolInputs?: Readonly<Record<string, string>>;
  /**
   * The user-authored Home note + links (Phase 30H.6) — the one Home store that is the user's own
   * content, so unlike usage stats it is exported. Optional: absent when the panel is empty and in
   * bundles written before it existed. Re-sanitized on parse and again on apply.
   */
  readonly homePanel?: HomePanelContent;
  /**
   * The user-designed Home (Phase 30I): panel instances, both placements, and user-authored panel
   * content. Additive and optional like `homePanel` (so the bundle schema version is unchanged and
   * older bundles still import). Re-sanitized against the panel registry on parse (`sanitizeLayout`)
   * and again on apply. Supersedes `homePanel`, which is still read from older bundles.
   */
  readonly homeLayout?: HomeLayoutData;
}

export type ConflictMode = 'skip' | 'replace' | 'keep-both';

export interface ExistingIds {
  readonly projects: ReadonlySet<string>;
  readonly workspaceTemplates: ReadonlySet<string>;
  readonly pipelines: ReadonlySet<string>;
  readonly userScripts: ReadonlySet<string>;
  /** The Home panel currently stored (treated as empty when omitted). */
  readonly homePanel?: HomePanelContent;
  /** The Home layout currently stored (treated as untouched when omitted). */
  readonly homeLayout?: HomeLayoutData;
}

export interface SectionPlan<T> {
  readonly items: readonly T[];
  readonly added: number;
  readonly replaced: number;
  readonly skipped: number;
}

export interface ImportPlan {
  readonly projects: SectionPlan<Project>;
  readonly workspaceTemplates: SectionPlan<WorkspaceTemplate>;
  readonly pipelines: SectionPlan<Pipeline>;
  readonly userScripts: SectionPlan<UserScriptDefinition>;
  /** At most one item: the Home panel to write, already merged per the conflict mode. */
  readonly homePanel: SectionPlan<HomePanelContent>;
  /** At most one item: the sanitized incoming layout; `apply` merges it per `conflictMode`. */
  readonly homeLayout: SectionPlan<HomeLayoutData>;
  readonly conflictMode?: ConflictMode;
  readonly toolPreferences: DudeBundle['toolPreferences'];
  readonly toolInputs: Readonly<Record<string, string>>;
  /** Entries in the file that failed validation and will be ignored. */
  readonly invalid: number;
}

export type ParseResult = { readonly ok: true; readonly bundle: DudeBundle; readonly invalid: number } | { readonly ok: false; readonly error: string };

const isString = (value: unknown): value is string => typeof value === 'string';
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTree = (value: unknown) => value === null || isRecord(value);

function isStepRef(value: unknown): value is PipelineStepRef {
  if (!isRecord(value) || !isString(value['stepId'])) return false;
  return (value['kind'] === 'tool' && isString(value['toolId'])) || (value['kind'] === 'script' && isString(value['scriptId']));
}

export function isProject(value: unknown): value is Project {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['name']) &&
    isString(value['createdAt']) &&
    isTree(value['panelTree']) &&
    isStringArray(value['openTabs']) &&
    isStringArray(value['pinnedPipelineIds'])
  );
}

export function isWorkspaceTemplate(value: unknown): value is WorkspaceTemplate {
  return isRecord(value) && isString(value['id']) && isString(value['name']) && isTree(value['panelTree']) && isStringArray(value['openTabs']);
}

export function isPipeline(value: unknown): value is Pipeline {
  return (
    isRecord(value) &&
    value['schemaVersion'] === 1 &&
    isString(value['id']) &&
    isString(value['name']) &&
    Array.isArray(value['steps']) &&
    value['steps'].every(isStepRef)
  );
}

export function isUserScript(value: unknown): value is UserScriptDefinition {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    isString(value['name']) &&
    isString(value['body']) &&
    isStringArray(value['accepts']) &&
    isStringArray(value['produces']) &&
    typeof value['timeoutMs'] === 'number'
  );
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => isString(entry[1])));
}

/** Parses and validates a bundle file. Never throws. Invalid entries are dropped and counted. */
export function parseBundle(text: string, sanitizeLayout?: (raw: unknown) => HomeLayoutData): ParseResult {
  if (text.length > MAX_BUNDLE_BYTES) return { ok: false, error: 'This file is too large to be a DUDE bundle.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file isn’t valid JSON.' };
  }
  if (!isRecord(raw) || raw['format'] !== BUNDLE_FORMAT) return { ok: false, error: 'This file isn’t a DUDE bundle.' };
  if (raw['schemaVersion'] !== BUNDLE_SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported bundle version ${String(raw['schemaVersion'])}. Update DUDE and try again.` };
  }

  let invalid = 0;
  const section = <T>(value: unknown, guard: (item: unknown) => item is T): T[] => {
    if (!Array.isArray(value)) return [];
    const valid = value.filter(guard);
    invalid += value.length - valid.length;
    return valid;
  };
  const toolPreferences = Object.fromEntries(
    Object.entries(isRecord(raw['toolPreferences']) ? raw['toolPreferences'] : {}).map(([toolId, keys]) => [toolId, stringRecord(keys)]),
  );

  // Validate every section before reading `invalid`, which `section` increments as it goes.
  const bundle: DudeBundle = {
    format: BUNDLE_FORMAT,
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    exportedAt: isString(raw['exportedAt']) ? raw['exportedAt'] : '',
    projects: section(raw['projects'], isProject),
    // Built-in templates ship with the app. A bundle can only ever contribute user templates.
    workspaceTemplates: section(raw['workspaceTemplates'], isWorkspaceTemplate).map((template) => ({ ...template, builtIn: false })),
    pipelines: section(raw['pipelines'], isPipeline),
    userScripts: section(raw['userScripts'], isUserScript),
    toolPreferences,
    toolInputs: raw['toolInputs'] === undefined ? undefined : stringRecord(raw['toolInputs']),
    homePanel: raw['homePanel'] === undefined ? undefined : sanitizeHomePanel(raw['homePanel']),
    homeLayout: raw['homeLayout'] === undefined || !sanitizeLayout ? undefined : sanitizeLayout(raw['homeLayout']),
  };
  return { ok: true, invalid, bundle };
}

/**
 * Resolves id conflicts against what's already stored. For `'keep-both'`, a conflicting item gets
 * a fresh id, and references to renamed pipelines/scripts inside the imported projects and
 * pipelines are rewritten to match, so nothing imported points at the wrong (pre-existing) item.
 * Every imported user script arrives with `imported: true`: it can't run until reviewed.
 */
export function planImport(bundle: DudeBundle, existing: ExistingIds, mode: ConflictMode, newId: () => string = () => crypto.randomUUID()): ImportPlan {
  const renamed = { pipelines: new Map<string, string>(), userScripts: new Map<string, string>() };

  const resolve = <T extends { readonly id: string }>(items: readonly T[], taken: ReadonlySet<string>, renames?: Map<string, string>) => {
    let added = 0;
    let replaced = 0;
    let skipped = 0;
    const out: T[] = [];
    for (const item of items) {
      if (!taken.has(item.id)) {
        added++;
        out.push(item);
      } else if (mode === 'replace') {
        replaced++;
        out.push(item);
      } else if (mode === 'keep-both') {
        const id = newId();
        renames?.set(item.id, id);
        added++;
        out.push({ ...item, id });
      } else {
        skipped++;
      }
    }
    return { items: out, added, replaced, skipped };
  };

  const scripts = resolve(bundle.userScripts, existing.userScripts, renamed.userScripts);
  const pipelines = resolve(bundle.pipelines, existing.pipelines, renamed.pipelines);
  const projects = resolve(bundle.projects, existing.projects);
  const templates = resolve(bundle.workspaceTemplates, existing.workspaceTemplates);
  const homePanel = planHomePanel(bundle.homePanel, existing.homePanel, mode);

  return {
    userScripts: { ...scripts, items: scripts.items.map((script) => ({ ...script, imported: true })) },
    pipelines: {
      ...pipelines,
      items: pipelines.items.map((pipeline) => ({
        ...pipeline,
        steps: pipeline.steps.map((step) =>
          step.kind === 'script' ? { ...step, scriptId: renamed.userScripts.get(step.scriptId) ?? step.scriptId } : step,
        ),
      })),
    },
    projects: {
      ...projects,
      items: projects.items.map((project) => ({
        ...project,
        pinnedPipelineIds: project.pinnedPipelineIds.map((id) => renamed.pipelines.get(id) ?? id),
      })),
    },
    workspaceTemplates: templates,
    homePanel,
    homeLayout: planHomeLayout(bundle.homeLayout, existing.homeLayout, mode),
    conflictMode: mode,
    toolPreferences: bundle.toolPreferences,
    toolInputs: bundle.toolInputs ?? {},
    invalid: 0,
  };
}

function planHomePanel(incoming: HomePanelContent | undefined, existing: HomePanelContent | undefined, mode: ConflictMode): SectionPlan<HomePanelContent> {
  const none = { items: [], added: 0, replaced: 0, skipped: 0 };
  if (!incoming || !hasHomePanelContent(incoming)) return none;
  if (!existing || !hasHomePanelContent(existing)) return { ...none, items: [incoming], added: 1 };
  if (mode === 'skip') return { ...none, skipped: 1 };
  const merged = mergeHomePanel(existing, incoming, mode);
  return mode === 'replace' ? { ...none, items: [merged], replaced: 1 } : { ...none, items: [merged], added: 1 };
}

const hasLayoutData = (data: HomeLayoutData | undefined): data is HomeLayoutData => !!data && (data.customized || Object.keys(data.content).length > 0);

function planHomeLayout(incoming: HomeLayoutData | undefined, existing: HomeLayoutData | undefined, mode: ConflictMode): SectionPlan<HomeLayoutData> {
  const none = { items: [], added: 0, replaced: 0, skipped: 0 };
  if (!hasLayoutData(incoming)) return none;
  if (!hasLayoutData(existing)) return { ...none, items: [incoming], added: 1 };
  if (mode === 'skip') return { ...none, skipped: 1 };
  return mode === 'replace' ? { ...none, items: [incoming], replaced: 1 } : { ...none, items: [incoming], added: 1 };
}
