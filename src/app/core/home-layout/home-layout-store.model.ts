import type { PanelConfig, PanelConfigField, UserContentKind } from '../../shared/models/panel-definition.model';
import { GridItem, LimitsOf, SizeLimits, deriveNarrow, firstFit, normalizeLayout } from './grid-engine';
import type { HomeLayout, PanelInstance } from './home-layout.model';
import { sanitizeConfig } from './panel-config';
import { UserContent, hasUserContent, sanitizeUserContent } from './user-content.model';

/**
 * Persisted Home layout (DUDE_PRD.md Phase 30I). Presentation state only: panel instances (each a
 * stable id + kind id + small typed config), per-width placements, visibility, and user-authored
 * panel content. It never copies tool/usage/favorites/project/workspace/pipeline state — panels
 * resolve those live from their authoritative services.
 *
 * Pure (no Angular): the service supplies a `KindCatalog` backed by the generated panel registry.
 */
export const HOME_LAYOUT_SCHEMA_VERSION = 1;
export const MAX_INSTANCES = 60;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** The slice of a panel declaration this module needs; `PanelDefinition` satisfies it structurally. */
export interface KindInfo {
  readonly id: string;
  readonly size: SizeLimits;
  readonly config?: readonly PanelConfigField[];
  readonly userContent?: UserContentKind;
  readonly multiInstance?: boolean;
}

export interface KindCatalog {
  /** Resolve a persisted kind id (following renames); undefined when the kind no longer exists. */
  resolve(kindId: string): KindInfo | undefined;
}

/** What a user layout is made of (also the exported/backup shape, minus the schema version). */
export interface HomeLayoutData {
  readonly customized: boolean;
  /** False until the user edits the narrow arrangement; narrow is then derived from wide. */
  readonly narrowCustomized: boolean;
  readonly instances: readonly PanelInstance[];
  readonly wide: readonly GridItem[];
  readonly narrow: readonly GridItem[];
  /** User-authored content keyed by instance id. */
  readonly content: Readonly<Record<string, UserContent>>;
}

export interface HomeLayoutStore extends HomeLayoutData {
  readonly schemaVersion: 1;
}

export const EMPTY_HOME_LAYOUT_DATA: HomeLayoutData = {
  customized: false,
  narrowCustomized: false,
  instances: [],
  wide: [],
  narrow: [],
  content: {},
};
export const EMPTY_HOME_LAYOUT_STORE: HomeLayoutStore = { schemaVersion: 1, ...EMPTY_HOME_LAYOUT_DATA };

export type HomeLayoutMergeMode = 'skip' | 'replace' | 'keep-both';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const FALLBACK_LIMITS: SizeLimits = { minW: 2, minH: 1 };

export function newInstanceId(kindId: string, rand: () => string = () => crypto.randomUUID()): string {
  return `${kindId}-${rand().replace(/-/g, '').slice(0, 8)}`.slice(0, 64);
}

function sanitizeInstances(raw: unknown, catalog: KindCatalog): PanelInstance[] {
  const out: PanelInstance[] = [];
  const seenIds = new Set<string>();
  const singletonKinds = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_INSTANCES) break;
    if (!isRecord(item)) continue;
    const id = item['id'];
    const persistedKind = item['kindId'];
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || seenIds.has(id)) continue;
    if (typeof persistedKind !== 'string' || persistedKind.length === 0 || persistedKind.length > 64) continue;
    const kind = catalog.resolve(persistedKind);
    if (kind && !kind.multiInstance) {
      if (singletonKinds.has(kind.id)) continue;
      singletonKinds.add(kind.id);
    }
    seenIds.add(id);
    // Unknown kinds are preserved (as dormant instances the editor can remove) so a temporarily
    // missing kind can't destroy the user's layout; the renderer simply skips them.
    out.push({
      id,
      kindId: kind ? kind.id : persistedKind,
      config: kind ? sanitizeConfig(kind.config, item['config']) : ({} as PanelConfig),
      visible: item['visible'] !== false,
    });
  }
  return out;
}

function sanitizePlacements(raw: unknown, instances: readonly PanelInstance[], limitsOf: LimitsOf): GridItem[] {
  const known = new Set(instances.map((i) => i.id));
  const seen = new Set<string>();
  const items: GridItem[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isRecord(item)) continue;
    const { id, x, y, w, h } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
    if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    seen.add(id);
    items.push({ id, x: x as number, y: y as number, w: w as number, h: h as number });
  }
  // Instances with no usable placement are appended at the bottom rather than dropped.
  let bottom = items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  for (const inst of instances) {
    if (seen.has(inst.id)) continue;
    const limits = limitsOf(inst.id);
    const h = Math.max(limits.minH, 2);
    items.push({ id: inst.id, x: 0, y: bottom, w: Math.min(Math.max(limits.minW, 6), limits.maxW ?? 12), h });
    bottom += h;
  }
  return normalizeLayout(items, limitsOf);
}

function limitsFor(instances: readonly PanelInstance[], catalog: KindCatalog): LimitsOf {
  const kindOf = new Map(instances.map((i) => [i.id, i.kindId]));
  return (id) => catalog.resolve(kindOf.get(id) ?? '')?.size ?? FALLBACK_LIMITS;
}

function sanitizeContent(
  raw: unknown,
  instances: readonly PanelInstance[],
  catalog: KindCatalog,
  newId: () => string,
): Record<string, UserContent> {
  const out: Record<string, UserContent> = {};
  if (!isRecord(raw)) return out;
  for (const inst of instances) {
    const kind = catalog.resolve(inst.kindId)?.userContent;
    if (!kind || !(inst.id in raw)) continue;
    const content = sanitizeUserContent(kind, raw[inst.id], newId);
    if (hasUserContent(content)) out[inst.id] = content;
  }
  return out;
}

/**
 * Defensive parse of a stored or imported layout. Never throws and never blanks Home: a bad record
 * degrades to "not customized" (the shipped default renders), a partly bad one is repaired.
 * `defaults` supplies the instances that content may attach to while the layout is uncustomized.
 */
export function sanitizeHomeLayoutData(
  raw: unknown,
  catalog: KindCatalog,
  defaults: HomeLayout,
  newId: () => string = () => crypto.randomUUID(),
): HomeLayoutData {
  if (!isRecord(raw)) return EMPTY_HOME_LAYOUT_DATA;
  const customized = raw['customized'] === true;
  const instances = customized ? sanitizeInstances(raw['instances'], catalog) : [];
  const contentInstances = customized ? instances : defaults.instances;
  const content = sanitizeContent(raw['content'], contentInstances, catalog, newId);
  if (!customized) return { ...EMPTY_HOME_LAYOUT_DATA, content };

  const limitsOf = limitsFor(instances, catalog);
  const wide = sanitizePlacements(raw['wide'], instances, limitsOf);
  const narrowCustomized = raw['narrowCustomized'] === true;
  const narrow = narrowCustomized ? sanitizePlacements(raw['narrow'], instances, limitsOf) : deriveNarrow(wide, limitsOf);
  return { customized, narrowCustomized, instances, wide, narrow, content };
}

export function migrateHomeLayoutStore(raw: unknown, catalog: KindCatalog, defaults: HomeLayout): HomeLayoutStore {
  if (!isRecord(raw) || raw['schemaVersion'] !== HOME_LAYOUT_SCHEMA_VERSION) return EMPTY_HOME_LAYOUT_STORE;
  return { schemaVersion: 1, ...sanitizeHomeLayoutData(raw, catalog, defaults) };
}

/** The layout Home renders: the user's when customized, else the manifest-generated default. */
export function effectiveLayout(data: HomeLayoutData, defaults: HomeLayout, catalog: KindCatalog): HomeLayout {
  if (!data.customized) return defaults;
  const narrow = data.narrowCustomized ? data.narrow : deriveNarrow(data.wide, limitsFor(data.instances, catalog));
  return { instances: data.instances, wide: data.wide, narrow };
}

/** Keep content for panels that survive a reset to the shipped default (user panels are removed). */
export function contentAfterReset(content: HomeLayoutData['content'], defaults: HomeLayout): HomeLayoutData['content'] {
  const keep = new Set(defaults.instances.map((i) => i.id));
  return Object.fromEntries(Object.entries(content).filter(([id]) => keep.has(id)));
}

/**
 * Resolves an imported layout against the existing one (Phase 26 conflict modes). An untouched
 * existing layout adopts the import. `keep-both` keeps the existing arrangement and appends the
 * import's user-authored panels (fresh ids) at the bottom of both widths.
 */
export function mergeHomeLayout(
  existing: HomeLayoutData,
  incoming: HomeLayoutData,
  mode: HomeLayoutMergeMode,
  defaults: HomeLayout,
  catalog: KindCatalog,
  newId: () => string = () => crypto.randomUUID(),
): HomeLayoutData {
  if (!incoming.customized && Object.keys(incoming.content).length === 0) return existing;
  if (!existing.customized && Object.keys(existing.content).length === 0) return incoming;
  if (mode === 'replace') return incoming;
  if (mode === 'skip') return existing;

  // keep-both
  const base: HomeLayout = effectiveLayout(existing, defaults, catalog);
  let instances = [...base.instances];
  let wide = [...base.wide];
  let narrow = [...base.narrow];
  const content: Record<string, UserContent> = { ...existing.content };
  for (const inst of incoming.customized ? incoming.instances : []) {
    const body = incoming.content[inst.id];
    if (!body || instances.length >= MAX_INSTANCES) continue;
    const id = newInstanceId(inst.kindId, newId);
    const limits = catalog.resolve(inst.kindId)?.size ?? FALLBACK_LIMITS;
    const size = { w: Math.min(Math.max(limits.minW, 6), limits.maxW ?? 12), h: Math.max(limits.minH, 2) };
    instances = [...instances, { ...inst, id }];
    wide = [...wide, { id, ...firstFit(wide, size) }];
    narrow = [...narrow, { id, ...firstFit(narrow, { ...size, w: Math.min(limits.maxW ?? 12, 12) }) }];
    content[id] = body;
  }
  return { customized: true, narrowCustomized: existing.customized ? existing.narrowCustomized : false, instances, wide, narrow, content };
}
