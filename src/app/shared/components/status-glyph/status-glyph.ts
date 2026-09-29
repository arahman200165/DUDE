import { Component, input } from '@angular/core';

/**
 * Semantic states that get an always-on, non-color cue (Phase 30K: status never relies on hue alone).
 * Each has a distinct silhouette (circle-x, triangle, circle-check, circle-i, open arc, slashed circle,
 * ring, dashed circle, dot) so states stay distinguishable in every palette, including the color-blind-safe one.
 */
export type StatusGlyphKind = 'error' | 'warning' | 'success' | 'info' | 'busy' | 'offline' | 'idle' | 'cancelled' | 'neutral';

/**
 * A compact inline-SVG status glyph, drawn in `currentColor` and always `aria-hidden`: the adjacent text
 * label stays the accessible name. Place it beside an existing label, never in place of one.
 */
@Component({
  selector: 'app-status-glyph',
  host: { class: 'inline-flex shrink-0', '[attr.data-glyph]': 'kind()' },
  template: `
    <svg
      class="h-3 w-3"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (kind()) {
        @case ('error') {
          <circle cx="8" cy="8" r="6.25" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
        }
        @case ('warning') {
          <path d="M8 2L14.5 13.5H1.5Z" />
          <path d="M8 6.5v3.25M8 11.75v.25" />
        }
        @case ('success') {
          <circle cx="8" cy="8" r="6.25" />
          <path d="M5 8.25l2.25 2.25L11 6" />
        }
        @case ('info') {
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 7.25v3.5M8 5v.25" />
        }
        @case ('busy') {
          <path d="M8 1.75A6.25 6.25 0 1 1 1.75 8" />
        }
        @case ('offline') {
          <circle cx="8" cy="8" r="6.25" />
          <path d="M3.6 12.4l8.8-8.8" />
        }
        @case ('idle') {
          <circle cx="8" cy="8" r="4.25" />
        }
        @case ('cancelled') {
          <circle cx="8" cy="8" r="6.25" stroke-dasharray="2.5 2.5" />
          <path d="M5.5 8h5" />
        }
        @default {
          <circle cx="8" cy="8" r="2.5" fill="currentColor" />
        }
      }
    </svg>
  `,
})
export class StatusGlyph {
  readonly kind = input.required<StatusGlyphKind>();
}
