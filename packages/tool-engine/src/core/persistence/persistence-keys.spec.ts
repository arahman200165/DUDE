import {
  NAMESPACE_PREFIX,
  buildConsentKey,
  buildConsentPrefix,
  buildStorageKey,
  buildToolPrefix,
} from "./persistence-keys.js";

describe('persistence-keys', () => {
  it('builds the expected storage key', () => {
    expect(buildStorageKey('json', 'indentSize')).toBe(`${NAMESPACE_PREFIX}:json:indentSize`);
  });

  it('builds the expected consent key', () => {
    expect(buildConsentKey('json', 'indentSize')).toBe(`${NAMESPACE_PREFIX}:__consent__:json:indentSize`);
  });

  it('buildToolPrefix is a prefix of that tool\'s keys', () => {
    const prefix = buildToolPrefix('json');
    expect(buildStorageKey('json', 'anyKey').startsWith(prefix)).toBe(true);
  });

  it('buildToolPrefix does not prefix-match a different tool with an overlapping name', () => {
    const prefix = buildToolPrefix('json');
    expect(buildStorageKey('json-2', 'anyKey').startsWith(prefix)).toBe(false);
  });

  it('buildConsentPrefix does not prefix-match a different tool with an overlapping name', () => {
    const prefix = buildConsentPrefix('json');
    expect(buildConsentKey('json-2', 'anyKey').startsWith(prefix)).toBe(false);
  });
});
