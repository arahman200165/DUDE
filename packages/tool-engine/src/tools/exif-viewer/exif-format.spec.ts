import { describe, expect, it } from 'vitest';
import { formatExifTags, formatGps } from "./exif-format.js";

describe('formatExifTags', () => {
  it('returns an empty list for null/undefined input', () => {
    expect(formatExifTags(null)).toEqual([]);
    expect(formatExifTags(undefined)).toEqual([]);
  });

  it('formats and sorts primitive tags', () => {
    const entries = formatExifTags({ Make: 'Canon', Model: 'EOS R5', ISO: 400 });
    expect(entries).toEqual([
      { key: 'ISO', value: '400' },
      { key: 'Make', value: 'Canon' },
      { key: 'Model', value: 'EOS R5' },
    ]);
  });

  it('drops binary thumbnail/maker-note payloads', () => {
    const entries = formatExifTags({ thumbnail: new Uint8Array([1, 2, 3]), MakerNote: new Uint8Array([4]), Make: 'Nikon' });
    expect(entries).toEqual([{ key: 'Make', value: 'Nikon' }]);
  });

  it('drops empty/null/undefined values', () => {
    const entries = formatExifTags({ Empty: '', Missing: null, AlsoMissing: undefined, Make: 'Sony' });
    expect(entries).toEqual([{ key: 'Make', value: 'Sony' }]);
  });

  it('renders a Date tag as ISO', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const entries = formatExifTags({ DateTimeOriginal: date });
    expect(entries).toEqual([{ key: 'DateTimeOriginal', value: date.toISOString() }]);
  });

  it('joins short arrays and drops long ones', () => {
    const entries = formatExifTags({
      ShortArray: [1, 2, 3],
      LongArray: Array.from({ length: 40 }, (_, i) => i),
    });
    expect(entries).toEqual([{ key: 'ShortArray', value: '1, 2, 3' }]);
  });
});

describe('formatGps', () => {
  it('returns null when there is no GPS data', () => {
    expect(formatGps(null)).toBeNull();
    expect(formatGps(undefined)).toBeNull();
  });

  it('formats latitude/longitude to 6 decimal places', () => {
    expect(formatGps({ latitude: 37.7749295, longitude: -122.4194155 })).toBe('37.774929, -122.419415');
  });
});
