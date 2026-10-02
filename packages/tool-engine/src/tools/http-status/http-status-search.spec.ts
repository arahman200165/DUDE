import { HttpStatusEntry } from "../../shared/utils/http-status-codes.js";
import { filterHttpStatusCodes } from "./http-status-search.js";

const DATA: readonly HttpStatusEntry[] = [
  { code: 200, name: 'OK', category: '2xx Success', description: 'The request succeeded.' },
  { code: 201, name: 'Created', category: '2xx Success', description: 'A new resource was created.' },
  { code: 404, name: 'Not Found', category: '4xx Client Error', description: 'Nothing matched the URI.' },
  { code: 500, name: 'Internal Server Error', category: '5xx Server Error', description: 'A generic error.' },
];

describe('filterHttpStatusCodes', () => {
  it('returns all entries grouped by category in 1xx-5xx order when filter text is empty', () => {
    const groups = filterHttpStatusCodes(DATA, '');
    expect(groups.map((g) => g.category)).toEqual(['2xx Success', '4xx Client Error', '5xx Server Error']);
    expect(groups[0].entries.map((e) => e.code)).toEqual([200, 201]);
  });

  it('matches by exact or partial code', () => {
    const groups = filterHttpStatusCodes(DATA, '404');
    expect(groups).toEqual([
      { category: '4xx Client Error', entries: [DATA[2]] },
    ]);
  });

  it('matches by name case-insensitively', () => {
    const groups = filterHttpStatusCodes(DATA, 'created');
    expect(groups.flatMap((g) => g.entries)).toEqual([DATA[1]]);
  });

  it('matches by description case-insensitively', () => {
    const groups = filterHttpStatusCodes(DATA, 'generic');
    expect(groups.flatMap((g) => g.entries)).toEqual([DATA[3]]);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterHttpStatusCodes(DATA, 'nonexistent')).toEqual([]);
  });

  it('sorts entries within a group by code ascending', () => {
    const groups = filterHttpStatusCodes([DATA[1], DATA[0]], '');
    expect(groups[0].entries.map((e) => e.code)).toEqual([200, 201]);
  });
});
