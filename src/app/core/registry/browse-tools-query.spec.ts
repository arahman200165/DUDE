import { parseBrowseQuery } from './browse-tools-query';

describe('parseBrowseQuery', () => {
  it('treats a plain query as free text only', () => {
    expect(parseBrowseQuery('jwt decoder')).toEqual({ freeText: 'jwt decoder' });
  });

  it('extracts a recognized category: operator, leaving remaining words as free text', () => {
    expect(parseBrowseQuery('category:security jwt')).toEqual({ freeText: 'jwt', category: 'security' });
  });

  it('extracts platform:, status:, favorite:, accepts:, and produces: together', () => {
    expect(parseBrowseQuery('platform:desktop status:verified favorite:true accepts:json produces:table csv')).toEqual({
      freeText: 'csv',
      platform: 'desktop',
      status: 'verified',
      favorite: true,
      accepts: 'json',
      produces: 'table',
    });
  });

  it('supports status:unstated as an explicit bucket', () => {
    expect(parseBrowseQuery('status:unstated')).toEqual({ freeText: '', status: 'unstated' });
  });

  it('degrades an unknown operator key to free text instead of dropping it', () => {
    expect(parseBrowseQuery('color:blue csv')).toEqual({ freeText: 'color:blue csv' });
  });

  it('degrades a recognized key with an invalid value to free text', () => {
    expect(parseBrowseQuery('category:nonexistent')).toEqual({ freeText: 'category:nonexistent' });
    expect(parseBrowseQuery('favorite:maybe')).toEqual({ freeText: 'favorite:maybe' });
  });

  it('never throws on malformed input', () => {
    expect(() => parseBrowseQuery(':::')).not.toThrow();
    expect(() => parseBrowseQuery('')).not.toThrow();
  });
});
