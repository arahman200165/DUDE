/**
 * Semantic states that get an always-on, non-color cue (Phase 30K: status never relies on hue alone).
 * Each has a distinct silhouette (circle-x, triangle, circle-check, circle-i, open arc, slashed circle,
 * ring, dashed circle, dot) so states stay distinguishable in every palette, including the color-blind-safe one.
 */
export type StatusGlyphKind = 'error' | 'warning' | 'success' | 'info' | 'busy' | 'offline' | 'idle' | 'cancelled' | 'neutral';
