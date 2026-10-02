import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";

/**
 * - `available` — render the panel.
 * - `explain` — show a compact capability explanation in its place (web, desktop-only panel).
 * - `omit` — render nothing and leave no grid cell.
 */
export type PanelAvailability = 'available' | 'explain' | 'omit';

export function panelAvailability(def: PanelDefinition, isDesktop: boolean): PanelAvailability {
  if (isDesktop) return 'available';
  const blocked = def.desktopOnly === true || (def.capabilities ?? []).some((c) => c.web === 'unavailable');
  if (!blocked) return 'available';
  return def.webBehavior === 'explain' ? 'explain' : 'omit';
}

/** Explanation text for an `explain` panel: the declared capability notes, joined. */
export function unavailableReason(def: PanelDefinition): string {
  const notes = (def.capabilities ?? []).filter((c) => c.web === 'unavailable').map((c) => c.note);
  return notes.length > 0 ? notes.join(' ') : 'This panel needs the desktop app.';
}
