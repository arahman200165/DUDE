/**
 * Pure, framework-free timezone conversion, built on `luxon`'s `DateTime`
 * (which itself defers to the platform's `Intl` timezone database, so the
 * IANA zone list below is sourced directly from `Intl.supportedValuesOf`
 * rather than duplicated).
 */
import { DateTime } from 'luxon';

export interface ZoneResult {
  readonly zone: string;
  readonly formatted: string;
  readonly utcOffset: string;
  readonly isDst: boolean;
}

export type ConvertResult =
  | { readonly ok: true; readonly results: readonly ZoneResult[] }
  | { readonly ok: false; readonly error: string };

export interface ConvertInput {
  readonly date: string;
  readonly time: string;
  readonly sourceZone: string;
}

export function convertToZones(input: ConvertInput, targetZones: readonly string[]): ConvertResult {
  if (input.date.trim() === '') {
    return { ok: false, error: 'Enter a date.' };
  }
  if (targetZones.length === 0) {
    return { ok: false, error: 'Add at least one target timezone.' };
  }

  const source = DateTime.fromISO(`${input.date}T${input.time || '00:00'}`, { zone: input.sourceZone });
  if (!source.isValid) {
    return { ok: false, error: source.invalidExplanation ?? 'Invalid date, time, or source timezone.' };
  }

  const results: ZoneResult[] = [];
  for (const zone of targetZones) {
    const converted = source.setZone(zone);
    if (!converted.isValid) {
      return { ok: false, error: `Unknown timezone: "${zone}"` };
    }
    results.push({
      zone,
      formatted: converted.toFormat('yyyy-MM-dd HH:mm:ss'),
      utcOffset: converted.toFormat('ZZ'),
      isDst: converted.isInDST,
    });
  }

  return { ok: true, results };
}

export function listTimeZones(): readonly string[] {
  const zones = new Set<string>(Intl.supportedValuesOf('timeZone'));
  zones.add('UTC');
  return Array.from(zones).sort();
}
