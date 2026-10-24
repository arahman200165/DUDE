import { Component, computed, effect, inject, signal } from '@angular/core';
import { HUB_NOTIFICATION_KINDS } from '@dude/contracts/hub';
import type { DeviceInfo, HubNotificationKind } from '@dude/contracts/hub';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { NotificationsService } from '../../../../core/notifications/notifications.service';
import { DesktopPreferencesService } from '../../../../core/platform/desktop-preferences.service';
import { PlatformService } from '../../../../core/platform/platform.service';
import { HubOwnerSession } from './hub-owner-session.service';

/** What each Hub notification kind is called in the OS notification list. */
export const HUB_NOTIFICATION_KIND_LABELS: Readonly<Record<HubNotificationKind, string>> = {
  'backup-failed': 'A scheduled backup failed',
  'backup-recovered': 'Backups work again after a failure',
  'backup-overdue': 'A scheduled backup is overdue',
  'tls-renewed': 'The Hub certificate was renewed',
  'tls-renewal-failed': 'A certificate renewal failed',
  'sync-compaction-failed': 'Sync history cleanup failed',
  'address-changed': "The Hub's address changed",
  'security-alert': 'A security alert was raised',
};

type GrantState = 'granted' | 'not-granted' | 'unknown';

/**
 * Environment & Hub (desktop, enrolled): whether this computer holds the notification-reader grant (PD-110) and which kinds of Hub notification
 * raise an OS notification. The choices are device-local (the desktop preferences, never synced), every kind is off until chosen, and the main
 * process raises the notification, so it also appears while the window is closed to the tray. The grant itself is the owner's to give, on the
 * Devices page. Nothing here changes the Hub.
 */
@Component({
  selector: 'app-desktop-notifications-panel',
  template: `
    @if (visible()) {
      <div data-setting class="flex flex-col gap-2" data-testid="desktop-notifications">
        <h3 class="text-ui-sm font-semibold text-text">OS notifications for Hub events</h3>
        <p class="text-ui text-text-muted" data-testid="grant-status">{{ grantText() }}</p>
        <fieldset class="flex flex-col gap-1">
          <legend class="text-ui text-text-muted">Show a Windows notification when</legend>
          @for (kind of kinds; track kind) {
            <label class="flex items-center gap-2 text-ui text-text">
              <input type="checkbox" class="accent-accent" [attr.data-testid]="'os-notify-' + kind" [checked]="prefs.current().hubNotifications[kind] === true" (change)="toggle(kind, $event)" />
              {{ labels[kind] }}
            </label>
          }
        </fieldset>
        <p class="text-ui text-text-muted">All are off until you choose. They are saved on this computer only, and they appear even when DUDE is closed to the tray.</p>
        @if (error(); as message) { <p class="text-ui text-error" role="alert" data-testid="os-notify-error">{{ message }}</p> }
      </div>
    }
  `,
})
export class DesktopNotificationsPanel {
  private readonly hub = inject(HUB_ADMIN);
  private readonly notifications = inject(NotificationsService);
  private readonly session = inject(HubOwnerSession);
  protected readonly prefs = inject(DesktopPreferencesService);

  protected readonly kinds = HUB_NOTIFICATION_KINDS;
  protected readonly labels = HUB_NOTIFICATION_KIND_LABELS;
  protected readonly visible = signal(inject(PlatformService).hostKind === 'desktop');
  protected readonly error = signal<string | null>(null);
  private readonly self = signal<DeviceInfo | null>(null);

  /** The owner's device list says it (this device's own row); without an owner session only a refusal is known. */
  protected readonly grant = computed<GrantState>(() => {
    const row = this.self();
    if (row !== null) return row.notificationsAccess === true ? 'granted' : 'not-granted';
    return this.notifications.denied() ? 'not-granted' : 'unknown';
  });
  protected readonly grantText = computed(() => {
    switch (this.grant()) {
      case 'granted':
        return 'This computer has the notification grant, so it can read Hub notifications without an owner session.';
      case 'not-granted':
        return 'This computer does not have the notification grant. The owner can give it in Settings > Devices; until then notifications are read only while the owner is signed in here, and OS notifications are not raised.';
      default:
        return 'Sign in as the owner to see whether this computer has the notification grant. The owner gives it in Settings > Devices.';
    }
  });

  constructor() {
    if (!this.visible()) return;
    // Preferences load best effort: the defaults (all off) show until they arrive.
    void this.prefs.load().catch(() => undefined);
    effect(() => {
      if (this.session.signedIn()) void this.loadSelf();
      else this.self.set(null);
    });
  }

  private async loadSelf(): Promise<void> {
    try {
      this.self.set((await this.hub.listDevices()).find((device) => device.current) ?? null);
    } catch {
      this.self.set(null);
    }
  }

  protected async toggle(kind: HubNotificationKind, event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    const enabled = box.checked;
    this.error.set(null);
    const result = await this.prefs.set({ hubNotifications: { ...this.prefs.current().hubNotifications, [kind]: enabled } });
    if (!result.ok) {
      box.checked = !enabled;
      this.error.set(result.error);
    }
  }
}
