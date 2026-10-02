import { Injectable, computed, inject, signal } from '@angular/core';
import { PersistenceService } from '../persistence/persistence.service';
import { PlatformService } from '../platform/platform.service';

/** Chromium's `beforeinstallprompt` event, which isn't in lib.dom yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Install-as-PWA Support (DUDE_PRD.md §21 Phase 26 Item 9). It captures Chromium's
 * `beforeinstallprompt` so DUDE can offer its own "Install app" button (Settings › Web & Offline,
 * plus a one-time dismissible Deck hint) instead of relying on the browser's easy-to-miss omnibox
 * icon. It never prompts on its own. The browser only allows `prompt()` from a user gesture anyway.
 * Hidden when already running installed (`display-mode: standalone`) and on desktop.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly platform = inject(PlatformService);
  private readonly deferred = signal<BeforeInstallPromptEvent | null>(null);
  private readonly installedSignal = signal(false);

  readonly runningInstalled =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  readonly hintDismissed = inject(PersistenceService).signal('__pwa__', 'installHintDismissed', 'local', false);

  /** The browser has offered installation and DUDE isn't already installed or running as an app. */
  readonly canInstall = computed(() => !!this.deferred() && !this.installedSignal() && !this.runningInstalled);
  readonly installed = computed(() => this.installedSignal() || this.runningInstalled);
  readonly showHint = computed(() => this.canInstall() && !this.hintDismissed());

  constructor() {
    if (this.platform.isDesktop() || typeof window === 'undefined') return;
    // index.html stashes a prompt that fired before Angular bootstrapped.
    const early = (window as { __dudeInstallPrompt?: BeforeInstallPromptEvent }).__dudeInstallPrompt;
    if (early) this.deferred.set(early);
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferred.set(event as BeforeInstallPromptEvent);
    });
    window.addEventListener('appinstalled', () => {
      this.installedSignal.set(true);
      this.deferred.set(null);
    });
  }

  /** Must be called from a click handler. Resolves to whether the user accepted. */
  async install(): Promise<boolean> {
    const event = this.deferred();
    if (!event) return false;
    this.deferred.set(null);
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') this.installedSignal.set(true);
    return outcome === 'accepted';
  }
}
