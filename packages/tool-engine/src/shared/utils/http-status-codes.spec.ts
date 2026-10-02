import { HTTP_STATUS_CODES } from "./http-status-codes.js";

const CATEGORY_PREFIX: Record<string, string> = {
  '1xx Informational': '1',
  '2xx Success': '2',
  '3xx Redirection': '3',
  '4xx Client Error': '4',
  '5xx Server Error': '5',
};

describe('HTTP_STATUS_CODES', () => {
  it('has no duplicate codes', () => {
    const codes = HTTP_STATUS_CODES.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has every code in the valid HTTP status range', () => {
    for (const entry of HTTP_STATUS_CODES) {
      expect(entry.code).toBeGreaterThanOrEqual(100);
      expect(entry.code).toBeLessThanOrEqual(599);
    }
  });

  it('assigns each entry the category matching its leading digit', () => {
    for (const entry of HTTP_STATUS_CODES) {
      expect(entry.code.toString().charAt(0)).toBe(CATEGORY_PREFIX[entry.category]);
    }
  });

  it('has a non-empty name and description for every entry', () => {
    for (const entry of HTTP_STATUS_CODES) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});
