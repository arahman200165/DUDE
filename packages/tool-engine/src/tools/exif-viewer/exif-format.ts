/**
 * Pure formatting for exifr's parsed tag object -- exifr itself does the
 * actual (async, binary) parsing, so this is the testable surface: turning
 * its loosely-typed output into a sorted, display-ready, non-binary list.
 */

export interface ExifEntry {
  readonly key: string;
  readonly value: string;
}

const HIDDEN_KEYS = new Set(['thumbnail', 'MakerNote', 'UserComment']);

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return null; // binary blobs aren't useful to render
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (value.length > 32) return null; // long numeric arrays (e.g. raw color profiles) aren't useful either
    return value.join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function formatExifTags(raw: Record<string, unknown> | undefined | null): readonly ExifEntry[] {
  if (!raw) return [];

  const entries: ExifEntry[] = [];
  for (const [key, rawValue] of Object.entries(raw)) {
    if (HIDDEN_KEYS.has(key)) continue;
    const value = formatValue(rawValue);
    if (value === null || value === '') continue;
    entries.push({ key, value });
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

export function formatGps(gps: { readonly latitude: number; readonly longitude: number } | null | undefined): string | null {
  if (!gps) return null;
  const lat = gps.latitude.toFixed(6);
  const lon = gps.longitude.toFixed(6);
  return `${lat}, ${lon}`;
}
