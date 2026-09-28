import { computeRenames, DEFAULT_RENAME, formatDate, invalidWindowsName, parseRenameList, type RenameEntry } from './rename-pattern';

const file = (path: string, mtimeMs = 0, size = 1): RenameEntry => ({ path, kind: 'file', size, mtimeMs });
const renamed = (entries: RenameEntry[], options: Partial<typeof DEFAULT_RENAME>, existing = new Map<string, Set<string>>()) =>
  computeRenames(entries, { ...DEFAULT_RENAME, ...options }, existing).map((proposal) => `${proposal.status}:${proposal.newName}`);

describe('batch rename engine', () => {
  it('finds and replaces in the base name, the extension, or the full name', () => {
    expect(renamed([file('IMG_001.JPG')], { find: 'img_', replace: 'photo-' })).toEqual(['rename:photo-001.JPG']);
    expect(renamed([file('IMG_001.JPG')], { target: 'extension', caseTransform: 'lower' })).toEqual(['rename:IMG_001.jpg']);
    expect(renamed([file('a.tar.gz')], { target: 'full', find: '.tar.gz', replace: '.tgz' })).toEqual(['rename:a.tgz']);
    expect(renamed([file('2024-01-05 report.pdf')], { regex: true, find: '(\\d{4})-(\\d{2})-(\\d{2})', replace: '$3.$2.$1' })).toEqual(['rename:05.01.2024 report.pdf']);
    expect(renamed([file('cost$.txt')], { find: 'cost', replace: 'price$1' })).toEqual(['rename:price$1$.txt']);
  });

  it('renders tokens: counters, parent, dates, size, hash, case transforms', () => {
    const entries = [file('trip/b.jpg', Date.UTC(2024, 5, 1, 12)), file('trip/a.jpg', Date.UTC(2024, 5, 2, 12))];
    expect(renamed(entries, { template: '{parent}-{n:000}{.ext}' })).toEqual(['rename:trip-001.jpg', 'rename:trip-002.jpg']);
    expect(renamed(entries, { template: '{n}{.ext}', sort: 'mtime', counterStart: 10, counterStep: 5 })).toEqual(['rename:10.jpg', 'rename:15.jpg']);
    expect(renamed([{ ...file('x.bin'), hash8: 'deadbeef' }], { template: '{name}-{hash8}{.ext}' })).toEqual(['rename:x-deadbeef.bin']);
    expect(renamed([file('Hello World.TXT', 0, 42)], { caseTransform: 'slug', template: '{name}_{size}{.ext}' })).toEqual(['rename:hello-world_42.TXT']);
    expect(renamed([file('the quick-brown fox.md')], { caseTransform: 'title' })).toEqual(['rename:The Quick-Brown Fox.md']);
    expect(formatDate(new Date(2024, 0, 2, 3, 4, 5).getTime(), 'yyyyMMdd_HHmmss')).toBe('20240102_030405');
  });

  it('flags invalid Windows names, collisions, and clashes with items that are not renamed away', () => {
    expect(invalidWindowsName('CON.txt')).toMatch(/reserved/);
    expect(invalidWindowsName('a?b')).toMatch(/can’t contain/);
    expect(invalidWindowsName('trailing.')).toMatch(/trailing/);
    expect(invalidWindowsName('fine.txt')).toBeNull();
    expect(renamed([file('a.txt'), file('b.txt')], { template: 'same{.ext}' })).toEqual(['collision:same.txt', 'collision:same.txt']);
    expect(renamed([file('a.txt')], { template: 'b{.ext}' }, new Map([['', new Set(['a.txt', 'b.txt'])]]))).toEqual(['exists:b.txt']);
    // A swap is fine: b.txt is itself being renamed away.
    expect(renamed([file('a.txt'), file('b.txt')], { mode: 'list', list: 'a.txt -> b.txt\nb.txt -> a.txt' }, new Map([['', new Set(['a.txt', 'b.txt'])]]))).toEqual(['rename:b.txt', 'rename:a.txt']);
    // Case-only renames never clash with themselves.
    expect(renamed([file('readme.md')], { caseTransform: 'upper', target: 'name' }, new Map([['', new Set(['readme.md'])]]))).toEqual(['rename:README.md']);
    expect(renamed([file('x.txt')], { template: 'CON{.ext}' })).toEqual(['invalid:CON.txt']);
  });

  it('parses rename lists in arrow, tab, and CSV forms and keeps folders in place', () => {
    expect([...parseRenameList('# comment\na.txt -> b.txt\nsub\\c.txt => d.txt\n"e f.txt",g.txt\nh.txt\ti.txt\n')]).toEqual([['a.txt', 'b.txt'], ['sub/c.txt', 'd.txt'], ['e f.txt', 'g.txt'], ['h.txt', 'i.txt']]);
    const [proposal] = computeRenames([file('sub/c.txt')], { ...DEFAULT_RENAME, mode: 'list', list: 'sub/c.txt -> other/d.txt' });
    expect(proposal.to).toBe('sub/d.txt');
  });
});
