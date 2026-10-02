/**
 * Lists IANA timezone identifiers via the platform's `Intl` timezone
 * database, so the list is never duplicated/hand-maintained. Shared by
 * every date-time tool that offers a timezone picker.
 */
export function listTimeZones(): readonly string[] {
  const zones = new Set<string>(Intl.supportedValuesOf('timeZone'));
  zones.add('UTC');
  return Array.from(zones).sort();
}
