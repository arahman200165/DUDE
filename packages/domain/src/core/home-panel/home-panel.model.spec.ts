import { describe, expect, it } from 'vitest';
import {
  EMPTY_HOME_PANEL_CONTENT,
  EMPTY_HOME_PANEL_STORE,
  HomePanelContent,
  MAX_LABEL_CHARS,
  MAX_LINKS,
  MAX_NOTE_CHARS,
  MAX_URL_CHARS,
  hasHomePanelContent,
  mergeHomePanel,
  migrateHomePanelStore,
  normalizeExternalUrl,
  sanitizeHomePanel,
  validateLink,
} from "./home-panel.model.js";

const link = (id: string, url: string, label = id) => ({ id, label, url });
let counter = 0;
const nextId = () => `gen-${++counter}`;

describe('normalizeExternalUrl', () => {
  it('accepts http and https and returns the normalized href', () => {
    expect(normalizeExternalUrl(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1');
    expect(normalizeExternalUrl('http://localhost:4200')).toBe('http://localhost:4200/');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///C:/secrets.txt', 'ftp://example.com', 'mailto:a@b.co', '//example.com', 'example.com', ''])(
    'rejects %s',
    (value) => {
      expect(normalizeExternalUrl(value)).toBeNull();
    },
  );

  it('rejects embedded credentials and over-long URLs', () => {
    expect(normalizeExternalUrl('https://user:pass@example.com')).toBeNull();
    expect(normalizeExternalUrl('https://user@example.com')).toBeNull();
    expect(normalizeExternalUrl(`https://example.com/${'a'.repeat(MAX_URL_CHARS)}`)).toBeNull();
  });
});

describe('validateLink', () => {
  it('trims and bounds the label, falling back to the host when blank', () => {
    expect(validateLink('  Docs  ', 'https://example.com')).toEqual({ ok: true, link: { label: 'Docs', url: 'https://example.com/' } });
    expect(validateLink('   ', 'https://example.com/x')).toEqual({ ok: true, link: { label: 'example.com', url: 'https://example.com/x' } });
    const long = validateLink('x'.repeat(200), 'https://example.com');
    expect(long.ok && long.link.label.length).toBe(MAX_LABEL_CHARS);
  });

  it('returns an error for an unsafe address', () => {
    expect(validateLink('Bad', 'javascript:alert(1)')).toMatchObject({ ok: false });
  });
});

describe('sanitizeHomePanel', () => {
  it('returns empty content for non-objects', () => {
    expect(sanitizeHomePanel(null)).toEqual(EMPTY_HOME_PANEL_CONTENT);
    expect(sanitizeHomePanel('note')).toEqual(EMPTY_HOME_PANEL_CONTENT);
    expect(sanitizeHomePanel([1, 2])).toEqual(EMPTY_HOME_PANEL_CONTENT);
  });

  it('bounds the note and keeps it as plain text', () => {
    const out = sanitizeHomePanel({ note: '<b>hi</b>'.repeat(1000), links: [] });
    expect(out.note.length).toBe(MAX_NOTE_CHARS);
    expect(out.note.startsWith('<b>hi</b>')).toBe(true);
    expect(sanitizeHomePanel({ note: 42 }).note).toBe('');
  });

  it('drops unsafe, malformed and duplicate links, and caps the count', () => {
    const many = Array.from({ length: 30 }, (_, i) => link(`id-${i}`, `https://example.com/${i}`));
    const out = sanitizeHomePanel(
      {
        note: '',
        links: [
          link('a', 'javascript:alert(1)'),
          { id: 'b', label: 'no url' },
          'junk',
          link('c', 'https://dup.example.com'),
          link('d', 'https://dup.example.com'),
          ...many,
        ],
      },
      nextId,
    );
    expect(out.links).toHaveLength(MAX_LINKS);
    expect(out.links.map((l) => l.url)).not.toContain('javascript:alert(1)');
    expect(out.links.filter((l) => l.url === 'https://dup.example.com/')).toHaveLength(1);
  });

  it('replaces missing, invalid or duplicate ids with generated ones', () => {
    const out = sanitizeHomePanel(
      {
        links: [
          { url: 'https://a.example.com' },
          { id: '../evil id', url: 'https://b.example.com' },
          { id: 'same', url: 'https://c.example.com' },
          { id: 'same', url: 'https://d.example.com' },
        ],
      },
      nextId,
    );
    const ids = out.links.map((l) => l.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toContain('same');
    expect(ids.every((id) => /^[A-Za-z0-9-]{1,64}$/.test(id))).toBe(true);
  });
});

describe('migrateHomePanelStore', () => {
  it('resets an unknown schema or garbage, and keeps a valid v1 store', () => {
    expect(migrateHomePanelStore(null)).toEqual(EMPTY_HOME_PANEL_STORE);
    expect(migrateHomePanelStore({ schemaVersion: 9, note: 'x', links: [] })).toEqual(EMPTY_HOME_PANEL_STORE);
    expect(migrateHomePanelStore({ schemaVersion: 1, note: 'keep', links: [link('a', 'https://example.com/')] })).toEqual({
      schemaVersion: 1,
      note: 'keep',
      links: [link('a', 'https://example.com/')],
    });
  });

  it('strips a tampered unsafe link from a stored v1 store', () => {
    const out = migrateHomePanelStore({ schemaVersion: 1, note: '', links: [link('a', 'javascript:alert(1)')] });
    expect(out.links).toEqual([]);
  });
});

describe('mergeHomePanel', () => {
  const mine: HomePanelContent = { note: 'mine', links: [link('m', 'https://mine.example.com/')] };
  const theirs: HomePanelContent = { note: 'theirs', links: [link('t', 'https://theirs.example.com/'), link('m2', 'https://mine.example.com/')] };

  it('adopts the import when nothing exists yet, whatever the mode', () => {
    expect(hasHomePanelContent(EMPTY_HOME_PANEL_CONTENT)).toBe(false);
    for (const mode of ['skip', 'replace', 'keep-both'] as const) expect(mergeHomePanel(EMPTY_HOME_PANEL_CONTENT, theirs, mode)).toBe(theirs);
  });

  it('skip keeps mine, replace takes theirs', () => {
    expect(mergeHomePanel(mine, theirs, 'skip')).toBe(mine);
    expect(mergeHomePanel(mine, theirs, 'replace')).toBe(theirs);
  });

  it('keep-both keeps my note and unions links by URL', () => {
    const merged = mergeHomePanel(mine, theirs, 'keep-both');
    expect(merged.note).toBe('mine');
    expect(merged.links.map((l) => l.url)).toEqual(['https://mine.example.com/', 'https://theirs.example.com/']);
  });

  it('keep-both adopts the imported note when mine is blank and stays within the link bound', () => {
    const blankNote = { note: '  ', links: Array.from({ length: MAX_LINKS }, (_, i) => link(`x${i}`, `https://x.example.com/${i}`)) };
    const merged = mergeHomePanel(blankNote, theirs, 'keep-both');
    expect(merged.note).toBe('theirs');
    expect(merged.links).toHaveLength(MAX_LINKS);
  });
});
