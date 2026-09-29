import fc from 'fast-check';
import {
  PATH_SOFT_LIMIT, analyzePath, dedupeRaw, detectShadows, effectiveEntries, entriesFromRaw, joinPath, moveItem, normalizeDir, parsePath, parsePathExt, probeMap, probeTargets,
} from './path-analysis';
import type { ProbeDirEntry } from './system-types';

const dir = (d: string, executables: string[] = [], over: Partial<ProbeDirEntry> = {}): ProbeDirEntry => ({ dir: d, exists: true, isDirectory: true, executables, ...over });
const PATHEXT = parsePathExt('.COM;.EXE;.BAT;.CMD');

describe('parsePath', () => {
  it('splits, trims, drops trailing empties and keeps inner ones', () => {
    const e = parsePath(' C:\\a ;;C:\\b;;');
    expect(e.map((x) => x.raw)).toEqual(['C:\\a', '', 'C:\\b']);
    expect(e[1].empty).toBe(true);
    expect(e.map((x) => x.index)).toEqual([0, 1, 2]);
  });

  it('strips quotes but flags them, and expands variables', () => {
    const [q, v] = parsePath('"C:\\Program Files\\x";%TOOLS%\\bin', { tools: 'D:\\t' });
    expect(q.quoted).toBe(true);
    expect(q.value).toBe('C:\\Program Files\\x');
    expect(q.raw).toBe('"C:\\Program Files\\x"');
    expect(v.expanded).toBe('D:\\t\\bin');
    expect(v.raw).toBe('%TOOLS%\\bin');
  });

  it('empty input gives no entries', () => {
    expect(parsePath('')).toEqual([]);
    expect(parsePath(' ; ;')).toEqual([]);
  });

  it('never throws and join(parse) is stable', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      const once = joinPath(parsePath(s).map((e) => e.raw));
      expect(joinPath(parsePath(once).map((e) => e.raw))).toBe(once);
    }));
  });
});

describe('normalizeDir', () => {
  it('folds slashes, trailing separators and case', () => {
    expect(normalizeDir('C:/Foo//Bar\\')).toBe('c:\\foo\\bar');
    expect(normalizeDir('C:\\')).toBe('c:\\');
    expect(normalizeDir('C:')).toBe('c:\\');
    expect(normalizeDir('\\\\srv\\share\\')).toBe('\\\\srv\\share');
  });
});

describe('analyzePath', () => {
  const kinds = (entries: ReturnType<typeof parsePath>, probe = new Map<string, ProbeDirEntry>()) => analyzePath(entries, probe).entries.map((a) => a.issues.map((i) => i.kind));

  it('flags duplicates case- and slash-insensitively and expansion-aware', () => {
    const entries = parsePath('C:\\Tools;c:/tools/;%T%', { t: 'C:\\TOOLS\\' });
    const result = analyzePath(entries, new Map());
    expect(result.entries.map((a) => a.issues.map((i) => i.kind))).toEqual([[], ['duplicate'], ['duplicate']]);
    expect(result.entries[1].issues[0].duplicateOf).toBe(0);
  });

  it('flags missing directories and files', () => {
    const entries = parsePath('C:\\gone;C:\\file.txt;C:\\ok');
    const probe = probeMap([dir('C:\\gone', [], { exists: false, isDirectory: false }), dir('C:\\file.txt', [], { isDirectory: false }), dir('C:\\ok')]);
    expect(kinds(entries, probe)).toEqual([['missing'], ['not-directory'], []]);
  });

  it('flags unresolved, relative, empty and quoted entries', () => {
    expect(kinds(parsePath('%NOPE%\\bin;bin\\x;;"C:\\q";C:\\z'))).toEqual([['unresolved'], ['relative'], ['empty'], ['quoted'], []]);
  });

  it('flags over-long entries and an over-long PATH', () => {
    const long = 'C:\\' + 'a'.repeat(300);
    expect(kinds(parsePath(long))[0]).toContain('long-entry');
    const many = Array.from({ length: 200 }, (_, i) => `C:\\dir-number-${i}-padding`).join(';');
    expect(analyzePath(parsePath(many), new Map()).global.map((g) => g.kind)).toEqual(['path-too-long']);
    expect(many.length).toBeGreaterThan(PATH_SOFT_LIMIT);
  });

  it('does not probe-flag unresolved or relative entries', () => {
    expect(probeTargets(parsePath('%X%\\a;rel;C:\\a;c:\\A\\;;'))).toEqual(['C:\\a']);
  });
});

describe('dedupeRaw / moveItem / joinPath', () => {
  it('keeps the first of each duplicate and preserves raw forms', () => {
    expect(dedupeRaw(['%A%\\bin', 'C:\\a\\bin\\', 'C:\\b', ' ', 'c:\\B'], { a: 'C:\\a' })).toEqual(['%A%\\bin', 'C:\\b']);
  });

  it('moves and clamps', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, -5)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 9, 0)).toEqual([1, 2, 3]);
  });

  it('a move preserves the multiset of entries', () => {
    fc.assert(fc.property(fc.array(fc.string(), { maxLength: 8 }), fc.integer({ min: -2, max: 10 }), fc.integer({ min: -2, max: 10 }), (items, a, b) => {
      expect([...moveItem(items, a, b)].sort()).toEqual([...items].sort());
    }));
  });

  it('entriesFromRaw keeps one entry per element', () => {
    expect(entriesFromRaw(['a', '', '%X%'], { x: 'y' }).map((e) => [e.index, e.expanded])).toEqual([[0, 'a'], [1, ''], [2, 'y']]);
  });
});

describe('effectiveEntries', () => {
  it('puts machine before user and tags scopes', () => {
    const e = effectiveEntries(parsePath('C:\\m1;;C:\\m2'), parsePath('C:\\u1'));
    expect(e.map((x) => [x.scope, x.raw, x.index])).toEqual([['machine', 'C:\\m1', 0], ['machine', 'C:\\m2', 1], ['user', 'C:\\u1', 2]]);
  });
});

describe('detectShadows', () => {
  it('reports the first directory as the winner, in PATH order', () => {
    const entries = parsePath('C:\\a;C:\\b;C:\\c');
    const probe = probeMap([dir('C:\\a', ['node.exe', 'only-a.exe']), dir('C:\\b', ['Node.exe']), dir('C:\\c', ['NODE.EXE', 'other.exe'])]);
    const shadows = detectShadows(entries, probe, PATHEXT);
    expect(shadows).toHaveLength(1);
    expect(shadows[0].name).toBe('node');
    expect(shadows[0].winner.dir).toBe('C:\\a');
    expect(shadows[0].shadowed.map((s) => s.dir)).toEqual(['C:\\b', 'C:\\c']);
    expect(shadows[0].common).toBe(true);
  });

  it('a reordered PATH changes the winner', () => {
    const probe = probeMap([dir('C:\\a', ['git.exe']), dir('C:\\b', ['git.exe'])]);
    expect(detectShadows(parsePath('C:\\b;C:\\a'), probe, PATHEXT)[0].winner.dir).toBe('C:\\b');
  });

  it('applies PATHEXT precedence within one directory', () => {
    const probe = probeMap([dir('C:\\a', ['tool.cmd', 'tool.exe']), dir('C:\\b', ['tool.bat'])]);
    const [s] = detectShadows(parsePath('C:\\a;C:\\b'), probe, PATHEXT);
    expect(s.winner.file).toBe('tool.exe');
    expect(s.winner.alsoInDir).toEqual(['tool.cmd']);
  });

  it('ignores a repeated directory, missing directories and non-PATHEXT files', () => {
    const probe = probeMap([dir('C:\\a', ['x.exe', 'readme.txt']), dir('C:\\gone', ['x.exe'], { exists: false })]);
    expect(detectShadows(parsePath('C:\\a;c:\\A\\;C:\\gone'), probe, PATHEXT)).toEqual([]);
  });

  it('notes a WindowsApps python alias stub that wins', () => {
    const apps = 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps';
    const probe = probeMap([dir(apps, ['python.exe', 'python3.exe']), dir('C:\\Python312', ['python.exe'])]);
    const [s] = detectShadows(parsePath(`${apps};C:\\Python312`), probe, PATHEXT);
    expect(s.name).toBe('python');
    expect(s.winner.appExecutionAlias).toBe(true);
    expect(s.note).toContain('App Execution Alias');
  });

  it('never throws for arbitrary input', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      const entries = parsePath(s);
      expect(() => detectShadows(entries, new Map(), PATHEXT)).not.toThrow();
      expect(() => analyzePath(entries, new Map())).not.toThrow();
    }));
  });
});
