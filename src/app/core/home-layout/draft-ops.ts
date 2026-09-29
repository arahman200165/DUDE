import type { PanelDefinition } from '../../shared/models/panel-definition.model';
import {
  GridItem,
  LayoutIssue,
  LimitsOf,
  PlacementResult,
  Placement,
  deriveNarrow,
  firstFit,
  moveInReadingOrder,
  readingOrder,
  tryPlace,
  validateLayout,
} from './grid-engine';
import type { HomeLayout, HomeLayoutDraft, LayoutWidth, PanelInstance } from './home-layout.model';
import { MAX_INSTANCES, newInstanceId } from './home-layout-store.model';
import { defaultConfig, sanitizeConfig } from './panel-config';
import type { UserContent } from './user-content.model';

/**
 * Pure editing operations on a `HomeLayoutDraft`, shared by the keyboard-accessible list/form
 * editor and the gridstack visual editor so both obey one set of rules (no overlaps, size limits,
 * single-instance kinds, shared instances/content across widths). Nothing here touches storage.
 * Every operation returns a new draft plus a human-readable `message` for the editor's live result.
 */
export type KindLookup = (kindId: string) => PanelDefinition | undefined;

export interface OpResult {
  readonly draft: HomeLayoutDraft;
  readonly ok: boolean;
  readonly message: string;
  /** Present for placement operations, so the editor can show why a change was refused. */
  readonly placement?: PlacementResult;
}

const DEFAULT_LIMITS = { minW: 2, minH: 1 };

export function draftFromLayout(layout: HomeLayout, narrowCustomized: boolean, content: HomeLayoutDraft['content']): HomeLayoutDraft {
  return { instances: layout.instances, wide: layout.wide, narrow: layout.narrow, narrowCustomized, content };
}

export function limitsOfDraft(draft: HomeLayoutDraft, kinds: KindLookup): LimitsOf {
  const kindOf = new Map(draft.instances.map((i) => [i.id, i.kindId]));
  return (id) => kinds(kindOf.get(id) ?? '')?.size ?? DEFAULT_LIMITS;
}

/** Keep narrow following wide until the user has deliberately arranged it. */
function follow(draft: HomeLayoutDraft, kinds: KindLookup): HomeLayoutDraft {
  return draft.narrowCustomized ? draft : { ...draft, narrow: deriveNarrow(draft.wide, limitsOfDraft(draft, kinds)) };
}

const fail = (draft: HomeLayoutDraft, message: string, placement?: PlacementResult): OpResult => ({ draft, ok: false, message, placement });
const done = (draft: HomeLayoutDraft, message: string, placement?: PlacementResult): OpResult => ({ draft, ok: true, message, placement });

const titleOf = (draft: HomeLayoutDraft, id: string, kinds: KindLookup): string => {
  const inst = draft.instances.find((i) => i.id === id);
  return (inst && kinds(inst.kindId)?.title) ?? 'Panel';
};

function placementsFor(draft: HomeLayoutDraft, width: LayoutWidth): readonly GridItem[] {
  return width === 'wide' ? draft.wide : draft.narrow;
}

/** Editing the narrow layout is a deliberate act: it freezes what was derived and detaches it from wide. */
function withWidth(draft: HomeLayoutDraft, width: LayoutWidth, placements: readonly GridItem[], kinds: KindLookup): HomeLayoutDraft {
  return width === 'wide' ? follow({ ...draft, wide: placements }, kinds) : { ...draft, narrow: placements, narrowCustomized: true };
}

export function addPanel(draft: HomeLayoutDraft, def: PanelDefinition, kinds: KindLookup, newId: () => string = () => crypto.randomUUID()): OpResult {
  if (draft.instances.length >= MAX_INSTANCES) return fail(draft, `Home can hold up to ${MAX_INSTANCES} panels.`);
  if (!def.multiInstance && draft.instances.some((i) => i.kindId === def.id)) return fail(draft, `${def.title} is already on Home.`);
  const taken = new Set(draft.instances.map((i) => i.id));
  const id = !taken.has(def.id) ? def.id : newInstanceId(def.id, newId);
  const maxW = Math.min(def.size.maxW ?? 12, 12);
  const w = Math.min(Math.max(def.size.minW, def.defaultPlacement?.w ?? 6), maxW);
  const h = Math.max(def.size.minH, def.defaultPlacement?.h ?? 2);
  const instance: PanelInstance = { id, kindId: def.id, config: defaultConfig(def.config), visible: true };
  const next = follow(
    {
      ...draft,
      instances: [...draft.instances, instance],
      wide: [...draft.wide, { id, ...firstFit(draft.wide, { w, h }) }],
      narrow: [...draft.narrow, { id, ...firstFit(draft.narrow, { w: maxW, h }) }],
    },
    kinds,
  );
  return done(next, `Added ${def.title} at the bottom of Home.`);
}

export function removePanel(draft: HomeLayoutDraft, id: string, kinds: KindLookup): OpResult {
  const title = titleOf(draft, id, kinds);
  const { [id]: _removed, ...content } = draft.content;
  return done(
    follow(
      {
        ...draft,
        instances: draft.instances.filter((i) => i.id !== id),
        wide: draft.wide.filter((i) => i.id !== id),
        narrow: draft.narrow.filter((i) => i.id !== id),
        content,
      },
      kinds,
    ),
    `Removed ${title}.`,
  );
}

export function duplicatePanel(draft: HomeLayoutDraft, id: string, kinds: KindLookup, newId: () => string = () => crypto.randomUUID()): OpResult {
  const source = draft.instances.find((i) => i.id === id);
  const def = source && kinds(source.kindId);
  if (!source || !def) return fail(draft, 'That panel can’t be duplicated.');
  if (!def.multiInstance) return fail(draft, `${def.title} can only appear once.`);
  if (draft.instances.length >= MAX_INSTANCES) return fail(draft, `Home can hold up to ${MAX_INSTANCES} panels.`);
  const copyId = newInstanceId(def.id, newId);
  const size = (list: readonly GridItem[]) => {
    const p = list.find((i) => i.id === id);
    return { w: p?.w ?? def.size.minW, h: p?.h ?? def.size.minH };
  };
  const content = draft.content[id] ? { ...draft.content, [copyId]: draft.content[id] } : draft.content;
  const next = follow(
    {
      ...draft,
      instances: [...draft.instances, { ...source, id: copyId }],
      wide: [...draft.wide, { id: copyId, ...firstFit(draft.wide, size(draft.wide)) }],
      narrow: [...draft.narrow, { id: copyId, ...firstFit(draft.narrow, size(draft.narrow)) }],
      content,
    },
    kinds,
  );
  return done(next, `Duplicated ${def.title}.`);
}

export function setVisible(draft: HomeLayoutDraft, id: string, visible: boolean, kinds: KindLookup): OpResult {
  return done({ ...draft, instances: draft.instances.map((i) => (i.id === id ? { ...i, visible } : i)) }, `${titleOf(draft, id, kinds)} ${visible ? 'shown' : 'hidden'}.`);
}

export function setConfigValue(draft: HomeLayoutDraft, id: string, key: string, value: unknown, kinds: KindLookup): OpResult {
  const inst = draft.instances.find((i) => i.id === id);
  const def = inst && kinds(inst.kindId);
  if (!inst || !def) return fail(draft, 'That panel has no settings.');
  const config = sanitizeConfig(def.config, { ...inst.config, [key]: value });
  return done({ ...draft, instances: draft.instances.map((i) => (i.id === id ? { ...i, config } : i)) }, `Updated ${def.title}.`);
}

export function setContent(draft: HomeLayoutDraft, id: string, content: UserContent): OpResult {
  return done({ ...draft, content: { ...draft.content, [id]: content } }, 'Content updated.');
}

/** Move one step earlier/later in reading order within a width. */
export function movePanel(draft: HomeLayoutDraft, width: LayoutWidth, id: string, direction: -1 | 1, kinds: KindLookup): OpResult {
  const list = placementsFor(draft, width);
  const limits = limitsOfDraft(draft, kinds);
  const moved = moveInReadingOrder(list, id, direction, limits);
  const changed = moved.some((m) => {
    const before = list.find((l) => l.id === m.id);
    return !before || before.x !== m.x || before.y !== m.y;
  });
  const title = titleOf(draft, id, kinds);
  if (!changed) {
    const ordered = readingOrder(list);
    const atEnd = direction === -1 ? ordered[0]?.id === id : ordered[ordered.length - 1]?.id === id;
    return fail(draft, atEnd ? `${title} is already ${direction === -1 ? 'first' : 'last'}.` : `${title} can’t swap places with its neighbour without overlapping.`);
  }
  return done(withWidth(draft, width, moved, kinds), `Moved ${title} ${direction === -1 ? 'earlier' : 'later'}.`);
}

/** Propose a new placement (position and/or size) for one panel in one width. Refused, not adjusted, on conflict. */
export function placePanel(draft: HomeLayoutDraft, width: LayoutWidth, id: string, candidate: Placement, kinds: KindLookup): OpResult {
  const list = placementsFor(draft, width);
  const limits = limitsOfDraft(draft, kinds)(id);
  const result = tryPlace(list, id, candidate, limits);
  if (!result.ok) return fail(draft, result.message, result);
  const next = list.map((i) => (i.id === id ? { id, ...result.placement } : i));
  return done(withWidth(draft, width, next, kinds), `${titleOf(draft, id, kinds)}: ${result.message}`, result);
}

/** Resize keeping the top-left cell. */
export function resizePanel(draft: HomeLayoutDraft, width: LayoutWidth, id: string, size: { w: number; h: number }, kinds: KindLookup): OpResult {
  const current = placementsFor(draft, width).find((i) => i.id === id);
  if (!current) return fail(draft, 'That panel isn’t placed in this layout.');
  return placePanel(draft, width, id, { x: current.x, y: current.y, ...size }, kinds);
}

/** Every problem that would block Save, across both widths. */
export function draftIssues(draft: HomeLayoutDraft, kinds: KindLookup): LayoutIssue[] {
  const limits = limitsOfDraft(draft, kinds);
  return [...validateLayout(draft.wide, limits), ...validateLayout(draft.narrow, limits)];
}

/** Re-attach the narrow layout to the wide one (re-derived), discarding a deliberate narrow arrangement. */
export function followWide(draft: HomeLayoutDraft, kinds: KindLookup): OpResult {
  return done(
    { ...draft, narrowCustomized: false, narrow: deriveNarrow(draft.wide, limitsOfDraft(draft, kinds)) },
    'Narrow layout now follows the wide layout.',
  );
}

/**
 * Order-independent fingerprint of a draft, for "does the editor differ from what is saved?".
 * The store re-sorts placements into reading order when it saves, so comparing raw arrays would
 * report a just-saved draft as still dirty. While narrow follows wide it is derived, so it is
 * left out of the fingerprint.
 */
export function draftSignature(draft: HomeLayoutDraft): string {
  const byId = (list: readonly GridItem[]) => [...list].sort((a, b) => a.id.localeCompare(b.id)).map((i) => [i.id, i.x, i.y, i.w, i.h]);
  return JSON.stringify({
    instances: draft.instances.map((i) => [i.id, i.kindId, i.visible, i.config]),
    wide: byId(draft.wide),
    narrow: draft.narrowCustomized ? byId(draft.narrow) : null,
    narrowCustomized: draft.narrowCustomized,
    content: Object.keys(draft.content).sort().map((k) => [k, draft.content[k]]),
  });
}
