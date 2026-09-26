import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from '../../../testing/property-harness';
import { formatRelativeTime, parseRelativeText } from './relative-time-parser-logic';

const REFERENCE_MS = Date.UTC(2026, 0, 15, 12, 0, 0);

describe('formatRelativeTime -> parseRelativeText round-trip', () => {
  it('recovers the same second offset for sub-minute differences ("in N seconds" / "N seconds ago")', () => {
    roundTrip(
      (seconds: number) => {
        const formatted = formatRelativeTime(REFERENCE_MS + seconds * 1000, REFERENCE_MS);
        if (!formatted.ok) throw new Error('expected formatRelativeTime to succeed');
        return formatted.text;
      },
      (text) => {
        const parsed = parseRelativeText(text as string, REFERENCE_MS);
        if (!parsed.ok) throw new Error('expected parseRelativeText to succeed');
        return Math.round((parsed.dateMs - REFERENCE_MS) / 1000);
      },
      fc.integer({ min: -59, max: 59 }).filter((seconds) => seconds !== 0),
    );
  });
});

describe('parseRelativeText / formatRelativeTime fuzzing', () => {
  it('parseRelativeText never throws for arbitrary text', () => {
    neverThrows((text: string) => parseRelativeText(text, REFERENCE_MS), fc.string());
  });

  it('formatRelativeTime never throws for arbitrary numeric input', () => {
    neverThrows((targetMs: number) => formatRelativeTime(targetMs, REFERENCE_MS), fc.double());
  });
});
