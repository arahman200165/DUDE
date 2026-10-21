import type { KeyValueRow, ToolRunResult } from '../../kit';
import { parseDuration } from '@dude/tool-engine/tools/duration-formatter/duration-convert';

/** The same engine call the web tool makes, shaped as key/value rows for the Android result list. */
export function durationRows(input: string): ToolRunResult {
  const parsed = parseDuration(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { ms, human, iso8601, breakdown } = parsed.result;
  const rows: KeyValueRow[] = [
    { key: 'ms', label: 'Milliseconds', value: String(ms) },
    { key: 'human', label: 'Human-readable', value: human },
    { key: 'iso8601', label: 'ISO 8601', value: iso8601 },
    { key: 'breakdown', label: 'Component breakdown', value: `${breakdown.days}d ${breakdown.hours}h ${breakdown.minutes}m ${breakdown.seconds}s ${breakdown.milliseconds}ms` },
  ];
  return { ok: true, output: rows };
}
