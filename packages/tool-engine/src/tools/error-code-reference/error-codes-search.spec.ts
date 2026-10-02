import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from "./error-codes-data.js";
import { filterErrorCodes } from "./error-codes-search.js";

describe('filterErrorCodes', () => {
  it('returns only entries from the requested category when filter text is empty', () => {
    const results = filterErrorCodes(ERROR_CODES, 'posix', '');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((entry) => entry.category === 'posix')).toBe(true);
  });

  it('matches a hex code with or without a 0x prefix', () => {
    const withPrefix = filterErrorCodes(ERROR_CODES, 'windows', '0x80070005');
    const withoutPrefix = filterErrorCodes(ERROR_CODES, 'windows', '80070005');
    expect(withPrefix.length).toBe(1);
    expect(withoutPrefix.length).toBe(1);
    expect(withPrefix[0].name).toBe('E_ACCESSDENIED');
  });

  it('matches by name and by description, case-insensitively', () => {
    expect(filterErrorCodes(ERROR_CODES, 'posix', 'econnrefused').length).toBe(1);
    expect(filterErrorCodes(ERROR_CODES, 'linux-signals', 'segmentation').length).toBe(1);
  });

  it('never returns entries from another category', () => {
    const results = filterErrorCodes(ERROR_CODES, 'dns', 'error');
    expect(results.every((entry) => entry.category === 'dns')).toBe(true);
  });
});
