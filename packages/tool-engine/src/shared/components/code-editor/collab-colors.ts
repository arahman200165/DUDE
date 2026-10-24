/**
 * Collaborator colors come from the palette (category) tokens, never from the peer: an awareness
 * state carries only a small integer `colorSlot`, and each viewer resolves it through their own
 * theme, so a cursor is legible in every theme, contrast mode and palette set.
 */
const SLOT_TOKENS = ['data', 'text', 'encoding', 'security', 'date-time', 'web', 'developer', 'documents'] as const;

export const COLLAB_COLOR_SLOTS = SLOT_TOKENS.length;

export interface CollabCursorColors {
  /** Caret, name label and selection edge. */
  readonly color: string;
  /** Selection fill. */
  readonly colorLight: string;
}

/** Any integer maps to a slot (negative and out-of-range values wrap); anything else maps to slot 0. */
export function normalizeColorSlot(slot: unknown): number {
  if (typeof slot !== 'number' || !Number.isInteger(slot)) return 0;
  return ((slot % COLLAB_COLOR_SLOTS) + COLLAB_COLOR_SLOTS) % COLLAB_COLOR_SLOTS;
}

export function collabCursorColors(slot: unknown): CollabCursorColors {
  const token = `var(--dude-cat-${SLOT_TOKENS[normalizeColorSlot(slot)]})`;
  return { color: token, colorLight: `color-mix(in srgb, ${token} 35%, transparent)` };
}
