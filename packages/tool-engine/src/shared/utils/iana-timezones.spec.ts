import { listTimeZones } from "./iana-timezones.js";

describe('listTimeZones', () => {
  it('includes UTC and well-known IANA zones, sorted', () => {
    const zones = listTimeZones();
    expect(zones).toContain('UTC');
    expect(zones).toContain('America/New_York');
    expect(zones).toContain('Asia/Tokyo');
    expect([...zones]).toEqual([...zones].sort());
  });

  it('has no duplicates', () => {
    const zones = listTimeZones();
    expect(new Set(zones).size).toBe(zones.length);
  });
});
