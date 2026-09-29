import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_SETTINGS_NAMESPACE, APPEARANCE_KEY } from '../persistence/app-settings';
import { buildStorageKey } from '../persistence/persistence-keys';
import { APPEARANCE_AXES } from './appearance.model';

const STORAGE_KEY = buildStorageKey(APP_SETTINGS_NAMESPACE, APPEARANCE_KEY);

function prepaintSource(): string {
  const html = readFileSync(resolve(process.cwd(), 'src/index.html'), 'utf8');
  const match = /<script id="dude-appearance-prepaint"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('index.html has no #dude-appearance-prepaint script');
  return match[1];
}

describe('index.html appearance pre-paint script', () => {
  const root = document.documentElement;
  const attrs = Object.values(APPEARANCE_AXES).map((axis) => axis.attr);

  function run(): void {
    new Function(prepaintSource())();
  }

  function clear(): void {
    localStorage.clear();
    for (const attr of attrs) root.removeAttribute(attr);
  }

  beforeEach(clear);
  afterEach(() => {
    vi.unstubAllGlobals();
    clear();
  });

  it('applies valid stored prefs as data-* attributes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'dark', contrast: 'high', accent: 'violet', catset: 'soft', semantic: 'cb-safe', density: 'comfortable' }));
    run();
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-contrast')).toBe('high');
    expect(root.getAttribute('data-accent')).toBe('violet');
    expect(root.getAttribute('data-catset')).toBe('soft');
    expect(root.getAttribute('data-semantic')).toBe('cb-safe');
    expect(root.getAttribute('data-density')).toBe('comfortable');
  });

  it('does nothing when nothing is stored', () => {
    expect(() => run()).not.toThrow();
    for (const attr of attrs) expect(root.hasAttribute(attr)).toBe(false);
  });

  it('does not throw and sets nothing for malformed JSON or non-objects', () => {
    for (const raw of ['{not json', '"dark"', '42', 'null']) {
      localStorage.setItem(STORAGE_KEY, raw);
      expect(() => run()).not.toThrow();
      for (const attr of attrs) expect(root.hasAttribute(attr)).toBe(false);
    }
  });

  it('does not throw when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => run()).not.toThrow();
    vi.restoreAllMocks();
  });

  it('ignores hostile or non-string values', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'x"]{}', accent: 'a'.repeat(33), density: 'UPPER', catset: 5, semantic: { a: 1 } }));
    run();
    for (const attr of attrs) expect(root.hasAttribute(attr)).toBe(false);
  });

  it('resolves mode "system" through matchMedia', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-color-scheme: light') }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'system' }));
    run();
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('resolves contrast "system" through matchMedia', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-contrast: more') }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ contrast: 'system' }));
    run();
    expect(root.getAttribute('data-contrast')).toBe('high');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('leaves the attribute unset for "system" when the media query does not match', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'system', contrast: 'system' }));
    run();
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(root.hasAttribute('data-contrast')).toBe(false);
  });

  it('stays in sync with the model: same attribute list and storage key', () => {
    const source = prepaintSource();
    const scriptAttrs = [...source.matchAll(/'(data-[a-z]+)'/g)].map((match) => match[1]);
    expect(scriptAttrs).toEqual(attrs);
    expect(/'(dude:v1:[^']+)'/.exec(source)?.[1]).toBe(STORAGE_KEY);
  });

  it('is placed in <head> before any stylesheet link', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/index.html'), 'utf8');
    const script = html.indexOf('id="dude-appearance-prepaint"');
    const stylesheet = html.search(/<link[^>]+rel="stylesheet"/);
    expect(script).toBeGreaterThan(-1);
    if (stylesheet !== -1) expect(script).toBeLessThan(stylesheet);
    expect(script).toBeLessThan(html.indexOf('</head>'));
  });
});
