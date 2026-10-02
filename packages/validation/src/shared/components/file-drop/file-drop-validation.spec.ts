import { exceedsMaxSize, matchesAccept } from "./file-drop-validation.js";

function makeFile(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('matchesAccept', () => {
  it('accepts any file when accept is undefined or empty', () => {
    expect(matchesAccept(makeFile('a.txt', 'text/plain'), undefined)).toBe(true);
    expect(matchesAccept(makeFile('a.txt', 'text/plain'), '')).toBe(true);
  });

  it('matches by extension, case-insensitively', () => {
    expect(matchesAccept(makeFile('a.PNG', 'image/png'), '.png,.jpg')).toBe(true);
    expect(matchesAccept(makeFile('a.gif', 'image/gif'), '.png,.jpg')).toBe(false);
  });

  it('matches by exact mime type', () => {
    expect(matchesAccept(makeFile('a.json', 'application/json'), 'application/json')).toBe(true);
    expect(matchesAccept(makeFile('a.xml', 'application/xml'), 'application/json')).toBe(false);
  });

  it('matches by mime wildcard', () => {
    expect(matchesAccept(makeFile('a.png', 'image/png'), 'image/*')).toBe(true);
    expect(matchesAccept(makeFile('a.txt', 'text/plain'), 'image/*')).toBe(false);
  });
});

describe('exceedsMaxSize', () => {
  it('never exceeds when maxSizeBytes is undefined', () => {
    expect(exceedsMaxSize(makeFile('a.txt', 'text/plain', 100), undefined)).toBe(false);
  });

  it('flags files strictly over the limit', () => {
    expect(exceedsMaxSize(makeFile('a.txt', 'text/plain', 100), 50)).toBe(true);
    expect(exceedsMaxSize(makeFile('a.txt', 'text/plain', 50), 50)).toBe(false);
    expect(exceedsMaxSize(makeFile('a.txt', 'text/plain', 10), 50)).toBe(false);
  });
});
