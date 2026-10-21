import type { KeyValueRow } from '../../kit';
import { formatOffsetMinutes } from '@dude/tool-engine/shared/utils/dst-transitions';
import { buildOffsetGrid, comparePairwise } from '@dude/tool-engine/tools/timezone-offset-comparator/timezone-offset-comparator-logic';

/**
 * Fallback zone list for runtimes without `Intl.supportedValuesOf` (Hermes may lack it, and the engine's `listTimeZones`
 * calls it unguarded). A curated spread of common zones, including half- and quarter-hour offsets. Any other zone is
 * still accepted when typed into the picker as long as `Intl.DateTimeFormat` knows it.
 */
export const CURATED_ZONES: readonly string[] = [
  'UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'America/Anchorage', 'America/Argentina/Buenos_Aires',
  'America/Bogota', 'America/Chicago', 'America/Denver', 'America/Halifax', 'America/Lima', 'America/Los_Angeles', 'America/Mexico_City',
  'America/New_York', 'America/Phoenix', 'America/Santiago', 'America/Sao_Paulo', 'America/St_Johns', 'America/Toronto', 'America/Vancouver',
  'Asia/Baghdad', 'Asia/Bangkok', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta', 'Asia/Jerusalem', 'Asia/Karachi', 'Asia/Kathmandu',
  'Asia/Kolkata', 'Asia/Manila', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tehran', 'Asia/Tokyo',
  'Atlantic/Azores', 'Atlantic/Reykjavik', 'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Darwin', 'Australia/Perth', 'Australia/Sydney',
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Berlin', 'Europe/Dublin', 'Europe/Istanbul', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid',
  'Europe/Moscow', 'Europe/Paris', 'Europe/Rome', 'Europe/Stockholm', 'Europe/Vienna', 'Europe/Warsaw', 'Europe/Zurich',
  'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Fiji', 'Pacific/Honolulu', 'Pacific/Kiritimati',
];

/** IANA zones from the runtime when it can list them, otherwise the curated list. */
export function listZones(intl: { supportedValuesOf?: (key: string) => string[] } = Intl as never): readonly string[] {
  try {
    if (typeof intl.supportedValuesOf === 'function') {
      const zones = new Set<string>(intl.supportedValuesOf('timeZone'));
      if (zones.size > 0) { zones.add('UTC'); return Array.from(zones).sort(); }
    }
  } catch { /* fall through to the curated list */ }
  return CURATED_ZONES;
}

/** Case-insensitive match on the zone id, ignoring `_`/`/` differences ("new york" finds America/New_York). */
export function filterZones(zones: readonly string[], query: string, limit = 8): readonly string[] {
  const needle = query.trim().toLowerCase().replace(/[\s_/]+/g, ' ');
  if (needle === '') return zones.slice(0, limit);
  return zones.filter(zone => zone.toLowerCase().replace(/[_/]+/g, ' ').includes(needle)).slice(0, limit);
}

export function isKnownZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
}

/** Selected zones are stored comma-separated, the web tool's `gridZonesText` session format. */
export const parseZones = (text: string): readonly string[] => text.split(',').map(zone => zone.trim()).filter(zone => zone !== '');
export const joinZones = (zones: readonly string[]): string => zones.join(', ');
export const zoneKey = (zone: string): string => zone.replace(/[^A-Za-z0-9_]/g, '-');

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** `YYYY-MM-DDTHH:mm` (the "Use now" text) in UTC. */
export function momentText(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export type MomentResult = { readonly ok: true; readonly ms: number } | { readonly ok: false; readonly error: string };

/** ISO 8601 date-time. Without an explicit `Z` or offset the text is read as UTC, so results never depend on the device zone. */
export function parseMoment(text: string): MomentResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a date and time.' };
  const normalized = trimmed.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T');
  let candidate = normalized;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) candidate = `${normalized}T00:00:00Z`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) candidate = `${normalized}:00Z`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized)) candidate = `${normalized}Z`;
  const ms = new Date(candidate).getTime();
  if (Number.isNaN(ms)) return { ok: false, error: 'Invalid date/time. Use ISO 8601, e.g. 2026-01-15T12:00 (UTC unless it has an offset).' };
  return { ok: true, ms };
}

export interface ZoneClock { readonly offsetMinutes: number; readonly local: string }

/** Wall-clock time and UTC offset of `zone` at `atMs`, via `Intl.DateTimeFormat` only (no zone-listing API). Null for an unknown zone. */
export function zoneClock(zone: string, atMs: number): ZoneClock | null {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return null; }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(atMs))) if (part.type !== 'literal') parts[part.type] = Number(part.value);
  const hour = parts.hour === 24 ? 0 : parts.hour!;
  const asUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, hour, parts.minute!, parts.second!);
  const offsetMinutes = Math.round((asUtc - Math.floor(atMs / 1000) * 1000) / 60_000);
  return {
    offsetMinutes,
    local: `${pad(parts.year!, 4)}-${pad(parts.month!)}-${pad(parts.day!)} ${pad(hour)}:${pad(parts.minute!)}:${pad(parts.second!)}`,
  };
}

export type RowsResult = { readonly ok: true; readonly rows: readonly KeyValueRow[] } | { readonly ok: false; readonly error: string };

/** One row per selected zone: wall-clock time and UTC offset at the moment. */
export function zonesAtMoment(zones: readonly string[], atMs: number): RowsResult {
  if (zones.length === 0) return { ok: false, error: 'Add at least one timezone.' };
  const rows: KeyValueRow[] = [];
  for (const zone of zones) {
    const clock = zoneClock(zone, atMs);
    if (!clock) return { ok: false, error: `Unknown timezone: "${zone}"` };
    rows.push({ key: zoneKey(zone), label: zone, value: `${clock.local} ${formatOffsetMinutes(clock.offsetMinutes)}` });
  }
  return { ok: true, rows };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** `buildOffsetGrid` as one row per zone listing the offset at the start of each month. */
export function offsetGridRows(zones: readonly string[], year: number): RowsResult {
  const grid = buildOffsetGrid({ zones, year });
  if (!grid.ok) return { ok: false, error: grid.error };
  return { ok: true, rows: grid.rows.map(row => ({ key: zoneKey(row.zone), label: row.zone, value: row.monthlyOffsets.map((offset, index) => `${MONTHS[index]} ${offset}`).join(', ') })) };
}

/** `comparePairwise` as rows: both offsets, the gap and when it next changes. */
export function pairwiseRows(zoneA: string, zoneB: string, atMs: number): RowsResult {
  const compared = comparePairwise({ zoneA, zoneB, atMs });
  if (!compared.ok) return { ok: false, error: compared.error };
  const { offsetA, offsetB, gapLabel, nextChange } = compared.result;
  const rows: KeyValueRow[] = [
    { key: 'offset-a', label: `Zone A offset (${zoneA})`, value: offsetA },
    { key: 'offset-b', label: `Zone B offset (${zoneB})`, value: offsetB },
    { key: 'gap', label: 'Gap', value: gapLabel },
  ];
  if (nextChange) rows.push({ key: 'next-change', label: 'Gap next changes', value: `${nextChange.zone} on ${nextChange.whenIso}, to a ${nextChange.newGapMinutes}-minute gap` });
  return { ok: true, rows };
}
