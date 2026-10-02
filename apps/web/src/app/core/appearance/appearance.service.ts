import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { APPEARANCE_KEY, APP_SETTINGS_NAMESPACE } from "@dude/tool-engine/core/persistence/app-settings";
import { PersistenceService } from '../persistence/persistence.service';
import {
  APPEARANCE_AXES,
  AppearancePrefs,
  DEFAULT_APPEARANCE,
  FontChoice,
  MediaState,
  fontStack,
  resolveEffective,
  sanitizeAppearance,
} from "@dude/domain/core/appearance/appearance.model";

const LIGHT_QUERY = '(prefers-color-scheme: light)';
const MORE_CONTRAST_QUERY = '(prefers-contrast: more)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Owns the persisted appearance preferences and applies them to `<html>` (Phase 30K): one `data-*`
 * attribute per axis in `theme-tokens.json` (the generated CSS selects on these), the two font
 * custom properties, and the `theme-color` meta. `revision` ticks after every application so
 * canvas-based consumers (charts) can re-read their color tokens.
 */
@Injectable({ providedIn: 'root' })
export class AppearanceService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly persistence = inject(PersistenceService);
  private readonly destroyRef = inject(DestroyRef);

  // Stored data may be stale, tampered with, or adopted raw from another tab — `prefs` is always clean.
  private readonly stored = this.persistence.signal<unknown>(APP_SETTINGS_NAMESPACE, APPEARANCE_KEY, 'local', DEFAULT_APPEARANCE, {
    crossTab: 'live',
  });
  readonly prefs = computed<AppearancePrefs>(() => sanitizeAppearance(this.stored()));

  private readonly prefersLight = signal(false);
  private readonly prefersMoreContrast = signal(false);
  private readonly prefersReducedMotion = signal(false);
  private readonly media = computed<MediaState>(() => ({
    prefersLight: this.prefersLight(),
    prefersMoreContrast: this.prefersMoreContrast(),
    prefersReducedMotion: this.prefersReducedMotion(),
  }));

  /** Every axis resolved to a concrete value (`'system'` replaced), keyed by axis name. */
  readonly effective = computed(() => resolveEffective(this.prefs(), this.media()));

  private lastNativeKey = '';

  private readonly revisionSignal = signal(0);
  /** Increments after each application to the document; read it to re-read CSS custom properties. */
  readonly revision = this.revisionSignal.asReadonly();

  constructor() {
    this.watchMedia(LIGHT_QUERY, this.prefersLight);
    this.watchMedia(MORE_CONTRAST_QUERY, this.prefersMoreContrast);
    this.watchMedia(REDUCED_MOTION_QUERY, this.prefersReducedMotion);

    effect(() => {
      const effective = this.effective();
      const prefs = this.prefs();
      if (typeof document === 'undefined') return;
      untracked(() => {
        this.apply(effective, prefs);
        this.revisionSignal.update((count) => count + 1);
      });
    });
  }

  /** Merge `partial` into the current preferences; the result is sanitised before it is stored. */
  set(partial: Partial<AppearancePrefs>): void {
    this.stored.set(sanitizeAppearance({ ...this.prefs(), ...partial }));
  }

  reset(): void {
    this.stored.set(DEFAULT_APPEARANCE);
  }

  private apply(effective: Record<string, string>, prefs: AppearancePrefs): void {
    const root = document.documentElement;
    for (const [axisName, axis] of Object.entries(APPEARANCE_AXES)) {
      root.setAttribute(axis.attr, effective[axisName] ?? axis.default);
    }
    this.applyFont(root, prefs.uiFont, 'data-ui-font', '--dude-font-sans', fontStack(prefs, 'ui'));
    this.applyFont(root, prefs.monoFont, 'data-mono-font', '--dude-font-mono', fontStack(prefs, 'mono'));

    const background = getComputedStyle(root).getPropertyValue('--dude-bg').trim();
    if (background) {
      this.applyThemeColor(background);
      this.syncNative(effective['theme'] === 'light' ? 'light' : 'dark', background);
    }
  }

  /** Curated ids use the generated attribute rule (also set pre-paint); custom names use an inline property. */
  private applyFont(root: HTMLElement, choice: FontChoice, attr: string, prop: string, stack: string): void {
    if (typeof choice === 'string') {
      root.setAttribute(attr, choice);
      root.style.removeProperty(prop);
    } else {
      root.removeAttribute(attr);
      root.style.setProperty(prop, stack);
    }
  }

  /** Desktop only: tells Electron's main process the resolved theme + background (skipped when unchanged). */
  private syncNative(mode: 'dark' | 'light', background: string): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(background)) return;
    const appearance = typeof window === 'undefined' ? undefined : this.platformBridgePort.get()?.appearance;
    if (typeof appearance?.setNative !== 'function') return;
    const key = `${mode}|${background.toLowerCase()}`;
    if (key === this.lastNativeKey) return;
    this.lastNativeKey = key;
    try {
      void Promise.resolve(appearance.setNative(mode, background)).catch(() => {});
    } catch { /* A missing or broken bridge must never break appearance application. */ }
  }

  /**
   * index.html ships two media-scoped theme-color metas so the first paint follows the OS scheme. Once
   * the user's effective theme is known those would override it, so they are dropped in favour of one
   * un-scoped meta carrying the resolved `--dude-bg`.
   */
  private applyThemeColor(background: string): void {
    const metas = Array.from(document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    for (const meta of metas) if (meta.hasAttribute('media')) meta.remove();
    const unscoped = metas.filter((candidate) => !candidate.hasAttribute('media'));
    for (const extra of unscoped.slice(1)) extra.remove();
    let meta = unscoped[0];
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', background);
  }

  private watchMedia(query: string, target: { set(value: boolean): void }): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    target.set(list.matches);
    const onChange = (event: MediaQueryListEvent) => target.set(event.matches);
    list.addEventListener?.('change', onChange);
    this.destroyRef.onDestroy(() => list.removeEventListener?.('change', onChange));
  }
}
