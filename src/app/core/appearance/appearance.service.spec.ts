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
    // The current axes have no light theme, so "system" still lands on the default value.
    expect(service.effective()['theme']).toBe(APPEARANCE_AXES['theme'].default);
    expect(root.getAttribute('data-theme')).toBe(APPEARANCE_AXES['theme'].default);
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
