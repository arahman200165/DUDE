import { parseFileAssociations } from './file-association-marker';

describe('installer file association marker', () => {
  it('accepts only a bounded, unique list of extension candidates', () => {
    expect(parseFileAssociations({ schemaVersion: 1, candidateExtensions: ['.json', '.yaml'] }))
      .toEqual({ candidateExtensions: ['.json', '.yaml'] });
    expect(parseFileAssociations({ schemaVersion: 1, candidateExtensions: ['.json', '.json'] })).toBeNull();
    expect(parseFileAssociations({ schemaVersion: 1, candidateExtensions: ['../secret'] })).toBeNull();
    expect(parseFileAssociations({ schemaVersion: 2, candidateExtensions: [] })).toBeNull();
    expect(parseFileAssociations({ schemaVersion: 1, candidateExtensions: Array(31).fill('.txt') })).toBeNull();
  });
});
