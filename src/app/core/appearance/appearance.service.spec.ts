import { TestBed } from '@angular/core/testing';
import { APPEARANCE_KEY, APP_SETTINGS_NAMESPACE } from '../persistence/app-settings';
import { buildStorageKey } from '../persistence/persistence-keys';
import { APPEARANCE_AXES, DEFAULT_APPEARANCE, fontStack } from './appearance.model';
import { AppearanceService } from './appearance.service';

const STORAGE_KEY = buildStorageKey(APP_SETTINGS_NAMESPACE, APPEARANCE_KEY);

describe('AppearanceService', () => {
  const root = document.documentElement;

  function reset(): void {
    localStorage.clear();
    for (const axis of Object.values(APPEARANCE_AXES)) root.removeAttribute(axis.attr);
    root.style.removeProperty('--dude-font-sans');
    root.style.removeProperty('--dude-font-mono');
  }

  beforeEach(() => {
    reset();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    reset();
  });

  function create(): AppearanceService {
    const service = TestBed.inject(AppearanceService);
    TestBed.tick();
    return service;
  }

  it('applies every axis attribute to <html> on init', () => {
    create();
    for (const axis of Object.values(APPEARANCE_AXES)) {
      expect(root.getAttribute(axis.attr)).toBe(axis.default);
    }
  });

  it('applies the default font stacks as custom properties', () => {
    create();
    expect(root.style.getPropertyValue('--dude-font-sans')).toBe(fontStack(DEFAULT_APPEARANCE, 'ui'));
    expect(root.style.getPropertyValue('--dude-font-mono')).toBe(fontStack(DEFAULT_APPEARANCE, 'mono'));
  });

  it('sanitizes stale stored data on load', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'neon', accent: 5, evil: true }));
    const service = create();
    expect(service.prefs()).toEqual(DEFAULT_APPEARANCE);
    expect(root.getAttribute('data-theme')).toBe(APPEARANCE_AXES['theme'].default);
  });

  it('set() merges a partial, sanitizes it and persists it', () => {
    const service = create();
    service.set({ mode: 'system', accent: 'bogus' });
    TestBed.tick();
    expect(service.prefs().mode).toBe('system');
    expect(service.prefs().accent).toBe(DEFAULT_APPEARANCE.accent);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toMatchObject({ mode: 'system', accent: DEFAULT_APPEARANCE.accent });
  });

  it('resolves "system" through matchMedia and keeps every attribute set', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('light'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const service = create();
    service.set({ mode: 'system' });
    TestBed.tick();
    // matchMedia reports prefers-color-scheme: light, so "system" resolves to the light theme.
    expect(service.effective()['theme']).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('applies density, UI size, data size and ligature preferences as data-* attributes', () => {
    const service = create();
    service.set({ density: 'comfortable', uiSize: 'large', monoSize: 'small', ligatures: 'off' });
    TestBed.tick();
    expect(root.getAttribute('data-density')).toBe('comfortable');
    expect(root.getAttribute('data-ui-size')).toBe('large');
    expect(root.getAttribute('data-mono-size')).toBe('small');
    expect(root.getAttribute('data-ligatures')).toBe('off');
    service.set({ density: 'ultra' });
    TestBed.tick();
    expect(root.getAttribute('data-density')).toBe('ultra');
  });

  it('applies a custom font name through the style property, and never an unsafe one', () => {
    const service = create();
    service.set({ monoFont: { custom: 'Cascadia Code' } });
    TestBed.tick();
    expect(root.style.getPropertyValue('--dude-font-mono')).toContain('"Cascadia Code", ');

    service.set({ monoFont: { custom: 'x"; background:url(evil)' } });
    TestBed.tick();
    expect(root.style.getPropertyValue('--dude-font-mono')).toBe(fontStack(DEFAULT_APPEARANCE, 'mono'));
  });

  describe('theme-color meta', () => {
    function themeColorMetas(): HTMLMetaElement[] {
      return Array.from(document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    }

    function addMeta(content: string, media?: string): HTMLMetaElement {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = content;
      if (media) meta.setAttribute('media', media);
      document.head.appendChild(meta);
      return meta;
    }

    beforeEach(() => themeColorMetas().forEach((meta) => meta.remove()));
    afterEach(() => {
      themeColorMetas().forEach((meta) => meta.remove());
      root.style.removeProperty('--dude-bg');
    });

    it('replaces the media-scoped metas with one un-scoped meta carrying --dude-bg', () => {
      addMeta('#0a0e14', '(prefers-color-scheme: dark)');
      addMeta('#eef1f5', '(prefers-color-scheme: light)');
      root.style.setProperty('--dude-bg', '#123456');
      create();
      const metas = themeColorMetas();
      expect(metas).toHaveLength(1);
      expect(metas[0].hasAttribute('media')).toBe(false);
      expect(metas[0].getAttribute('content')).toBe('#123456');
    });

    it('creates the meta when none exists and keeps a single one across re-applications', () => {
      root.style.setProperty('--dude-bg', '#123456');
      const service = create();
      service.set({ monoFont: { custom: 'Inter' } });
      root.style.setProperty('--dude-bg', '#654321');
      TestBed.tick();
      const metas = themeColorMetas();
      expect(metas).toHaveLength(1);
      expect(metas[0].getAttribute('content')).toBe('#654321');
    });

    it('leaves the metas alone when --dude-bg is not computable', () => {
      addMeta('#0a0e14', '(prefers-color-scheme: dark)');
      create();
      const metas = themeColorMetas();
      expect(metas).toHaveLength(1);
      expect(metas[0].getAttribute('media')).toBe('(prefers-color-scheme: dark)');
    });
  });

  it('increments revision on each application', () => {
    const service = create();
    const first = service.revision();
    expect(first).toBeGreaterThan(0);
    service.set({ monoFont: { custom: 'Inter' } });
    TestBed.tick();
    expect(service.revision()).toBeGreaterThan(first);
  });

  it('reset() restores the defaults', () => {
    const service = create();
    service.set({ monoFont: { custom: 'Inter' } });
    service.reset();
    TestBed.tick();
    expect(service.prefs()).toEqual(DEFAULT_APPEARANCE);
  });

  it("adopts another tab's write (storage event) and re-applies", () => {
    const service = create();
    const before = service.revision();
    const next = JSON.stringify({ ...DEFAULT_APPEARANCE, monoFont: { custom: 'Iosevka' }, injected: 'x' });
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: next, storageArea: localStorage }));
    TestBed.tick();
    expect(service.prefs().monoFont).toEqual({ custom: 'Iosevka' });
    expect(root.style.getPropertyValue('--dude-font-mono')).toContain('"Iosevka"');
    expect(service.revision()).toBeGreaterThan(before);
    for (const axis of Object.values(APPEARANCE_AXES)) expect(root.getAttribute(axis.attr)).toBe(axis.default);
  });

  it('tampered cross-tab data cannot inject CSS', () => {
    const service = create();
    const hostile = JSON.stringify({ ...DEFAULT_APPEARANCE, uiFont: { custom: '</style><script>' } });
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: hostile, storageArea: localStorage }));
    TestBed.tick();
    expect(service.prefs().uiFont).toBe(DEFAULT_APPEARANCE.uiFont);
    expect(root.style.getPropertyValue('--dude-font-sans')).toBe(fontStack(DEFAULT_APPEARANCE, 'ui'));
  });
});
