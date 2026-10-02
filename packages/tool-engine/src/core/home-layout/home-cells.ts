import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";
import { GridItem, compactUp, readingOrder } from "@dude/domain/core/home-layout/grid-engine";
import type { HomeLayout, LayoutWidth, PanelInstance } from "@dude/domain/core/home-layout/home-layout.model";
import type { PanelAvailability } from "./panel-availability.js";

/** Width (px) of the Home canvas below which the narrow placements are used. */
export const NARROW_MAX_PX = 720;

export function widthOf(canvasPx: number): LayoutWidth {
  return canvasPx > 0 && canvasPx < NARROW_MAX_PX ? 'narrow' : 'wide';
}

export interface HomeCell {
  readonly instance: PanelInstance;
  readonly def: PanelDefinition;
  /** `available` renders the panel; `explain` renders the compact desktop-only explanation. */
  readonly availability: Exclude<PanelAvailability, 'omit'>;
  readonly placement: GridItem;
}

export interface CellResolvers {
  definitionOf(kindId: string): PanelDefinition | undefined;
  availabilityOf(def: PanelDefinition): PanelAvailability;
  /** Data-driven applicability (`showWhen`); called only for available panels. */
  shouldShow(def: PanelDefinition): boolean;
}

/**
 * What Home actually renders for one width: hidden, dormant (unknown kind), omitted and currently
 * not-applicable panels are dropped, then the survivors are compacted upward so no grid cells are
 * left blank. Returned in reading order, which is also DOM/focus order.
 */
export function resolveCells(layout: HomeLayout, width: LayoutWidth, r: CellResolvers): HomeCell[] {
  const placements = width === 'narrow' ? layout.narrow : layout.wide;
  const placementOf = new Map(placements.map((p) => [p.id, p]));
  const kept: HomeCell[] = [];
  for (const instance of layout.instances) {
    const placement = placementOf.get(instance.id);
    if (!instance.visible || !placement) continue;
    const def = r.definitionOf(instance.kindId);
    if (!def) continue;
    const availability = r.availabilityOf(def);
    if (availability === 'omit') continue;
    if (availability === 'available' && !r.shouldShow(def)) continue;
    kept.push({ instance, def, availability, placement });
  }
  const compact = new Map(compactUp(kept.map((c) => c.placement)).map((p) => [p.id, p]));
  const placed = kept.map((c) => ({ ...c, placement: compact.get(c.instance.id)! }));
  const order = new Map(readingOrder(placed.map((c) => c.placement)).map((p, i) => [p.id, i]));
  return placed.sort((a, b) => order.get(a.instance.id)! - order.get(b.instance.id)!);
}
