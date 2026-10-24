import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import type { HubNotification } from '@dude/contracts/hub';
import { NOTIFICATIONS_DENIED_MESSAGE, NotificationsService } from '../../core/notifications/notifications.service';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { relativeTime } from '../settings/sections/hub/hub-format';

const SEVERITY_LABEL: Readonly<Record<HubNotification['severity'], string>> = { info: 'Info', warning: 'Warning', error: 'Error' };
const SEVERITY_TEXT: Readonly<Record<HubNotification['severity'], string>> = { info: 'text-info', warning: 'text-warning', error: 'text-error' };
const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const BADGE_MAX = 99;

/**
 * The notification bell, mounted once by `ShellLayout` in the top-right badge stack (shell exception #14, PD-111). It renders nothing unless this
 * environment exposes Hub notifications (Hub web, or a desktop enrolled in a Hub). The unread count is part of the button's accessible name and a
 * polite live region announces new arrivals. The panel is a focus-managed dialog: it takes focus when opened, Tab stays inside it, Escape or a click
 * outside closes it and Escape returns focus to the bell. Opening never marks anything read; "Mark all read" and a per-item Dismiss are explicit.
 */
@Component({
  selector: 'app-notifications-bell',
  imports: [StatusGlyph],
  templateUrl: './notifications-bell.html',
  host: { '(document:click)': 'onDocumentClick($event)' },
})
export class NotificationsBell {
  protected readonly service = inject(NotificationsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly open = signal(false);
  protected readonly panelId = 'notifications-panel';
  protected readonly deniedMessage = NOTIFICATIONS_DENIED_MESSAGE;
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly badge = computed(() => {
    const unread = this.service.unread();
    return unread > BADGE_MAX ? `${BADGE_MAX}+` : String(unread);
  });
  protected readonly label = computed(() => {
    const unread = this.service.unread();
    return unread === 0 ? 'Notifications' : `Notifications, ${unread} unread`;
  });

  protected severityLabel(item: HubNotification): string { return SEVERITY_LABEL[item.severity]; }
  protected severityClass(item: HubNotification): string { return SEVERITY_TEXT[item.severity]; }
  protected age(item: HubNotification): string { return relativeTime(item.createdAt); }

  protected toggle(): void {
    if (this.open()) this.close(false);
    else this.show();
  }

  private show(): void {
    this.open.set(true);
    void this.service.ensureLoaded();
    afterNextRender(() => this.panel()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Closes the panel; `restoreFocus` returns focus to the bell (Escape), a click elsewhere keeps the focus where the user put it. */
  protected close(restoreFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.trigger()?.nativeElement.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    }
  }

  /** Keeps Tab inside the open panel. */
  protected onPanelKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = this.panel()?.nativeElement;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  protected markAllRead(): void { void this.service.markRead('all'); }
  protected dismiss(item: HubNotification): void { void this.service.dismiss(item.id); }
  protected retry(): void { void this.service.refresh(); }
}
