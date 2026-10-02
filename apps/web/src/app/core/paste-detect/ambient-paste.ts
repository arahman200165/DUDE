import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { PasteDetectionMatch, PasteDetector } from "@dude/domain/shared/models/paste-detector.model";
import { detectShapes } from "@dude/tool-engine/core/paste-detect/paste-detect";

/**
 * Ambient Smart Paste (DUDE_PRD.md §21 Phase 24 Item 2) reuses `detectShapes`/`PASTE_DETECTORS`
 * unmodified, filtered to a stricter confidence floor than the dedicated `/smart-paste` page uses
 * (which shows its top 4 matches regardless of score) — an uninvited floating suggestion has a
 * higher false-positive cost than a page the user opened on purpose. Only the single best match is
 * ever surfaced ambiently; a lower-confidence secondary match is not worth the extra chip clutter.
 */
export const AMBIENT_CONFIDENCE_FLOOR = 0.75;

export function detectAmbientMatch(
  text: string,
  detectors: readonly PasteDetector[],
  getTool: (toolId: string) => ToolDefinition | undefined,
): PasteDetectionMatch | null {
  const best = detectShapes(text, detectors, getTool).find((match) => match.score >= AMBIENT_CONFIDENCE_FLOOR);
  return best ?? null;
}

/**
 * A paste landing on an input/textarea/contenteditable element already has an obvious destination
 * (the field the user is deliberately pasting into) — the ambient chip must never fire there, or it
 * would nag on every ordinary in-tool paste. Only a paste onto a non-editable surface (blank page
 * area, a `<div>`, etc.) is genuinely "not sure what to do with this yet."
 */
export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true;
  return target.isContentEditable === true;
}
