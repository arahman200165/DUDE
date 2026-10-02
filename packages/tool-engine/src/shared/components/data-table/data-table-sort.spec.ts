import { nextSortState, sortRows } from "./data-table-sort.js";

interface Row {
  readonly name: string;
  readonly uses: string;
}

const rows: readonly Row[] = [
  { name: 'Base64', uses: '9' },
  { name: 'Regex Tester', uses: '20' },
  { name: 'CSV Viewer', uses: '3' },
];

function valueOf(row: Row, key: string): string {
  return key === 'uses' ? row.uses : row.name;
}

describe('sortRows', () => {
  it('returns rows unchanged when no sort is active', () => {
    expect(sortRows(rows, undefined, valueOf)).toEqual(rows);
  });

  it('sorts numeric-looking columns numerically, not lexically', () => {
    const sorted = sortRows(rows, { key: 'uses', direction: 'asc' }, valueOf);
    expect(sorted.map((r) => r.name)).toEqual(['CSV Viewer', 'Base64', 'Regex Tester']);
  });

  it('sorts descending', () => {
    const sorted = sortRows(rows, { key: 'uses', direction: 'desc' }, valueOf);
    expect(sorted.map((r) => r.name)).toEqual(['Regex Tester', 'Base64', 'CSV Viewer']);
  });

  it('sorts text columns lexically', () => {
    const sorted = sortRows(rows, { key: 'name', direction: 'asc' }, valueOf);
    expect(sorted.map((r) => r.name)).toEqual(['Base64', 'CSV Viewer', 'Regex Tester']);
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    sortRows(rows, { key: 'uses', direction: 'asc' }, valueOf);
    expect(rows).toEqual(copy);
  });
});

describe('nextSortState', () => {
  it('starts ascending on an unsorted column', () => {
    expect(nextSortState(undefined, 'uses')).toEqual({ key: 'uses', direction: 'asc' });
  });

  it('goes ascending -> descending -> unsorted for the same column', () => {
    const asc = nextSortState(undefined, 'uses')!;
    const desc = nextSortState(asc, 'uses');
    expect(desc).toEqual({ key: 'uses', direction: 'desc' });
    expect(nextSortState(desc, 'uses')).toBeUndefined();
  });

  it('switching to a different column restarts at ascending', () => {
    const usesDesc: { key: string; direction: 'asc' | 'desc' } = { key: 'uses', direction: 'desc' };
    expect(nextSortState(usesDesc, 'name')).toEqual({ key: 'name', direction: 'asc' });
  });
});
