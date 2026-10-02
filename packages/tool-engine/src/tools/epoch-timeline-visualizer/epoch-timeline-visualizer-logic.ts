/**
 * Pure, framework-free marker/range building for the Epoch Timeline
 * Visualizer, in two modes: a free list of labeled timestamps, or a
 * start/end range -- both rendered through the shared `app-timeline`.
 */
import { DateTime } from 'luxon';
import { TimelineMarkerInput } from "../../shared/components/timeline/timeline-layout.js";

export interface MarkersResult {
  readonly ok: true;
  readonly markers: readonly TimelineMarkerInput[];
  readonly rangeStartMs: number;
  readonly rangeEndMs: number;
}

export type TimelineResult = MarkersResult | { readonly ok: false; readonly error: string };

/** Accepts an epoch timestamp (seconds or milliseconds) or an ISO 8601 string. */
function parseInstant(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  if (/^-?\d+$/.test(trimmed)) {
    const digits = trimmed.replace('-', '').length;
    return digits >= 13 ? Number(trimmed) : Number(trimmed) * 1000;
  }

  const parsed = DateTime.fromISO(trimmed);
  return parsed.isValid ? parsed.toMillis() : null;
}

/** Each line is `<timestamp>` or `<timestamp> | <label>`. */
export function parseMultiTimestamps(text: string, includeNow: boolean, nowMs: number): TimelineResult {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return { ok: false, error: 'Enter at least one timestamp.' };

  const markers: TimelineMarkerInput[] = [];
  for (const line of lines) {
    const [rawTimestamp, ...labelParts] = line.split('|');
    const epochMs = parseInstant(rawTimestamp);
    if (epochMs === null) return { ok: false, error: `Could not parse "${rawTimestamp.trim()}" as a timestamp.` };
    const label = labelParts.join('|').trim() || new Date(epochMs).toISOString();
    markers.push({ epochMs, label });
  }

  if (includeNow) markers.push({ epochMs: nowMs, label: 'Now', emphasis: 'now' });

  return { ok: true, markers, ...paddedRange(markers.map((m) => m.epochMs)) };
}

export interface RangeInput {
  readonly startMs: number;
  readonly endMs: number;
  readonly includeNow: boolean;
  readonly nowMs: number;
}

export function buildRangeMarkers(input: RangeInput): TimelineResult {
  if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs)) {
    return { ok: false, error: 'Enter valid start and end date/times.' };
  }
  if (input.endMs <= input.startMs) return { ok: false, error: 'End must be after start.' };

  const markers: TimelineMarkerInput[] = [
    { epochMs: input.startMs, label: 'Start', emphasis: 'accent' },
    { epochMs: input.endMs, label: 'End', emphasis: 'accent' },
  ];
  if (input.includeNow && input.nowMs >= input.startMs && input.nowMs <= input.endMs) {
    markers.push({ epochMs: input.nowMs, label: 'Now', emphasis: 'now' });
  }

  const span = input.endMs - input.startMs;
  const padding = Math.max(span * 0.05, 1);
  return { ok: true, markers, rangeStartMs: input.startMs - padding, rangeEndMs: input.endMs + padding };
}

function paddedRange(values: readonly number[]): { readonly rangeStartMs: number; readonly rangeEndMs: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.1, 60_000);
  return { rangeStartMs: min - padding, rangeEndMs: max + padding };
}
