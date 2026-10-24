import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import type { PresenceActivity } from '@dude/contracts/hub';
import { activityForUrl, sameActivity } from '@dude/contracts/hub/presence-activity';
import { PersistenceService } from '../persistence/persistence.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { PRESENCE_PORT } from './presence.port';

/** A burst of navigations (a redirect, quick clicking through tools) settles for this long before anything is sent. */
export const PRESENCE_DEBOUNCE_MS = 1000;

/**
 * Shares what this device is showing with its own Hub (PD-108). Strictly opt-in: while `__device__:presenceShareActivity` is off
 * (the default) nothing is derived or sent. While on, the router URL is mapped to a tool or a shell destination, debounced and
 * deduplicated, and handed to the host's `PresencePort`; turning the setting off sends one `null` so the Hub stops showing it. The
 * Hub holds it in memory only and never audits it. `available` is false where no port exists (Pages, a standalone web build), and
 * the setting is not offered there. Constructed by an app initializer so it follows navigation from the first route.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly port = inject(PRESENCE_PORT);
  private readonly router = inject(Router);
  private readonly registry = inject(ToolRegistryService);

  readonly available = this.port !== null;
  /** `__device__:presenceShareActivity`: device-local, never synced. */
  readonly shareActivity = inject(PersistenceService).signal('__device__', 'presenceShareActivity', 'local', false, { writeDefault: false });

  private readonly current = signal<PresenceActivity | null>(null);
  /** The last value handed to the port (null: nothing is being shared). */
  private sent: PresenceActivity | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (this.port === null) return;
    if (this.router.navigated) this.current.set(this.derive(this.router.url));
    const subscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.current.set(this.derive(event.urlAfterRedirects));
    });
    effect(() => this.reconcile(this.shareActivity(), this.current()));
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      clearTimeout(this.timer);
    });
  }

  private derive(url: string): PresenceActivity | null {
    return activityForUrl(url, (route) => this.registry.getByRoute(route)?.id);
  }

  private reconcile(enabled: boolean, activity: PresenceActivity | null): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!enabled) {
      if (this.sent !== null) this.deliver(null);
      return;
    }
    if (sameActivity(activity, this.sent)) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.deliver(activity);
    }, PRESENCE_DEBOUNCE_MS);
  }

  private deliver(activity: PresenceActivity | null): void {
    this.sent = activity;
    try {
      this.port?.setActivity(activity);
    } catch {
      // delivery is best effort: the next change sends again
    }
  }
}
