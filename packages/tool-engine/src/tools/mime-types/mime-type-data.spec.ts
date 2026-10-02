import { MIME_TYPES } from "./mime-type-data.js";

describe('MIME_TYPES', () => {
  it('has no duplicate type strings', () => {
    const types = MIME_TYPES.map((entry) => entry.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('has exactly one "/" in every type string', () => {
    for (const entry of MIME_TYPES) {
      expect(entry.type.split('/')).toHaveLength(2);
    }
  });

  it('assigns each entry the topLevelType matching its type prefix', () => {
    for (const entry of MIME_TYPES) {
      expect(entry.type.startsWith(`${entry.topLevelType}/`)).toBe(true);
    }
  });

  const VALID_TOP_LEVEL_TYPES = ['application', 'audio', 'font', 'image', 'message', 'model', 'multipart', 'text', 'video'];

  it('only uses the 9 valid top-level types', () => {
    for (const entry of MIME_TYPES) {
      expect(VALID_TOP_LEVEL_TYPES).toContain(entry.topLevelType);
    }
  });
});
