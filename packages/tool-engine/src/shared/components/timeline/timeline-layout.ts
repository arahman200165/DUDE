/**
 * Pure, framework-free layout math for the shared `app-timeline` primitive:
 * positions arbitrary epoch-millisecond markers as percentages along a
 * [rangeStartMs, rangeEndMs] axis, and builds evenly-spaced axis tick labels.
 */

export type TimelineEmphasis = 'default' | 'accent' | 'now';

export interface TimelineMarkerInput {
  readonly epochMs: number;
  readonly label?: string;
  readonly emphasis?: TimelineEmphasis;
}

export interface PositionedMarker extends TimelineMarkerInput {
  readonly percent: number;
}

export function positionMarkers(
  markers: readonly TimelineMarkerInput[],
  rangeStartMs: number,
  rangeEndMs: number,
): readonly PositionedMarker[] {
  const spanMs = Math.max(1, rangeEndMs - rangeStartMs);
  return markers.map((marker) => ({ ...marker, percent: clamp(((marker.epochMs - rangeStartMs) / spanMs) * 100, 0, 100) }));
}

export interface TimelineTick {
  readonly percent: number;
  readonly label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;

export function buildTicks(rangeStartMs: number, rangeEndMs: number, count = 5): readonly TimelineTick[] {
  const spanMs = Math.max(1, rangeEndMs - rangeStartMs);
  const ticks: TimelineTick[] = [];

  for (let i = 0; i < count; i++) {
    const fraction = count === 1 ? 0 : i / (count - 1);
    const ms = rangeStartMs + fraction * spanMs;
    ticks.push({ percent: fraction * 100, label: formatTickLabel(ms, spanMs) });
  }

  return ticks;
}

function formatTickLabel(ms: number, spanMs: number): string {
  const date = new Date(ms);
  if (spanMs <= DAY_MS) return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (spanMs <= YEAR_MS) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
