import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { APPEARANCE_KEY, APP_SETTINGS_NAMESPACE } from '../persistence/app-settings';
import { PersistenceService } from '../persistence/persistence.service';
import {
  APPEARANCE_AXES,
  AppearancePrefs,
  DEFAULT_APPEARANCE,
  MediaState,
  fontStack,
  resolveEffective,
  sanitizeAppearance,
} from './appearance.model';

const LIGHT_QUERY = '(prefers-color-scheme: light)';
const MORE_CONTRAST_QUERY = '(prefers-contrast: more)';

/**
 * Owns the persisted appearance preferences and applies them to `<html>` (Phase 30K): one `data-*`
 * attribute per axis in `theme-tokens.json` (the generated CSS selects on these), the two font
 * custom properties, and the `theme-color` meta. `revision` ticks after every application so
 * canvas-based consumers (charts) can re-read their color tokens.
 */
@Injectable({ providedIn: 'root' })
export class AppearanceService {
  private readonly persistence = inject(PersistenceService);
  private readonly destroyRef = inject(DestroyRef);

  // Stored data may be stale, tampered with, or adopted raw from another tab — `prefs` is always clean.
  private readonly stored = this.persistence.signal<unknown>(APP_SETTINGS_NAMESPACE, APPEARANCE_KEY, 'local', DEFAULT_APPEARANCE, {
    crossTab: 'live',
  });
  readonly prefs = computed<AppearancePrefs>(() => sanitizeAppearance(this.stored()));

  private readonly prefersLight = signal(false);
  private readonly prefersMoreContrast = signal(false);
  private readonly media = computed<MediaState>(() => ({
    prefersLight: this.prefersLight(),
    prefersMoreContrast: this.prefersMoreContrast(),
  }));

  /** Every axis resolved to a concrete value (`'system'` replaced), keyed by axis name. */
  readonly effective = computed(() => resolveEffective(this.prefs(), this.media()));

  private readonly revisionSignal = signal(0);
  /** Increments after each application to the document; read it to re-read CSS custom properties. */
  readonly revision = this.revisionSignal.asReadonly();

  constructor() {
    this.watchMedia(LIGHT_QUERY, this.prefersLight);
    this.watchMedia(MORE_CONTRAST_QUERY, this.prefersMoreContrast);

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
    root.style.setProperty('--dude-font-sans', fontStack(prefs, 'ui'));
    root.style.setProperty('--dude-font-mono', fontStack(prefs, 'mono'));

    const background = getComputedStyle(root).getPropertyValue('--dude-bg').trim();
    if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
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
