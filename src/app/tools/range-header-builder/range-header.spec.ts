import {
  EMPTY_CONTENT_RANGE,
  buildContentRangeHeader,
  buildRangeHeader,
  checkRangeWarnings,
  parseContentRangeHeader,
  parseRangeHeader,
} from './range-header';

describe('parseRangeHeader', () => {
  it('matches RFC 9110 Section 14.1.2 multi-range bytes example', () => {
    const parsed = parseRangeHeader('bytes=0-0,-1');
    expect(parsed).toEqual([{ key: '0', value: '0' }, { key: '', value: '1' }]);
    expect(buildRangeHeader(parsed)).toBe('bytes=0-0,-1');
  });

  it('parses a single range', () => {
    expect(parseRangeHeader('bytes=0-499')).toEqual([{ key: '0', value: '499' }]);
  });

  it('parses multiple ranges', () => {
    expect(parseRangeHeader('bytes=0-499,1000-1499')).toEqual([
      { key: '0', value: '499' },
      { key: '1000', value: '1499' },
    ]);
  });

  it('parses an open-ended range and a suffix range', () => {
    expect(parseRangeHeader('bytes=500-,-500')).toEqual([
      { key: '500', value: '' },
      { key: '', value: '500' },
    ]);
  });

  it('returns an empty array for a header with no "bytes=" prefix', () => {
    expect(parseRangeHeader('not a range')).toEqual([]);
  });
});

describe('buildRangeHeader', () => {
  it('round-trips through parseRangeHeader', () => {
    const original = 'bytes=0-499,1000-1499';
    expect(buildRangeHeader(parseRangeHeader(original))).toBe(original);
  });

  it('returns an empty string when there are no valid ranges', () => {
    expect(buildRangeHeader([{ key: '', value: '' }])).toBe('');
  });
});

describe('checkRangeWarnings', () => {
  it('flags a range with start greater than end', () => {
    const warnings = checkRangeWarnings([{ key: '500', value: '100' }]);
    expect(warnings.some((w) => w.includes('start greater than its end'))).toBe(true);
  });

  it('flags a completely empty range', () => {
    const warnings = checkRangeWarnings([{ key: '', value: '' }]);
    expect(warnings.some((w) => w.includes('meaningless'))).toBe(true);
  });

  it('returns no warnings for valid ranges, including open-ended ones', () => {
    expect(checkRangeWarnings([{ key: '0', value: '499' }, { key: '500', value: '' }, { key: '', value: '500' }])).toEqual([]);
  });
});

describe('parseContentRangeHeader / buildContentRangeHeader', () => {
  it('matches RFC 9110 Section 14.4 first-500-bytes example', () => {
    const parsed = parseContentRangeHeader('bytes 0-499/1234');
    expect(parsed).toEqual({ start: '0', end: '499', total: '1234' });
    expect(buildContentRangeHeader(parsed)).toBe('bytes 0-499/1234');
  });

  it('parses and rebuilds a known-total Content-Range', () => {
    const parsed = parseContentRangeHeader('bytes 0-499/1234');
    expect(parsed).toEqual({ start: '0', end: '499', total: '1234' });
    expect(buildContentRangeHeader(parsed)).toBe('bytes 0-499/1234');
  });

  it('handles an unknown total', () => {
    const parsed = parseContentRangeHeader('bytes 0-499/*');
    expect(parsed).toEqual({ start: '0', end: '499', total: '' });
    expect(buildContentRangeHeader(parsed)).toBe('bytes 0-499/*');
  });

  it('handles an unsatisfiable range (no range, known total)', () => {
    expect(buildContentRangeHeader({ start: '', end: '', total: '1234' })).toBe('bytes */1234');
  });

  it('returns EMPTY_CONTENT_RANGE for malformed input', () => {
    expect(parseContentRangeHeader('not a content-range')).toEqual(EMPTY_CONTENT_RANGE);
  });
});
