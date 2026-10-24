import { Notification, type BrowserWindow } from 'electron';
import { parseNotificationEvent } from '@dude/contracts/hub';
import type { HubNotificationPreferences, HubNotificationSeverity } from '@dude/contracts/hub';
import type { DeviceStoreHost } from './device-store/agent-host';
import { getDesktopPreferences } from './desktop-preferences';

/**
 * OS notifications for live Hub notifications (PD-110). Main raises them, not the renderer: the Device Agent's `hub.notification` push goes to
 * main first, so they keep working while the window is hidden in the tray. Each kind is opt-in (`hubNotifications` in the device-local desktop
 * preferences, all off by default). Only live events get here; a notification fetched by listing never raises a toast. The id of every toast shown
 * is remembered (bounded) so a redelivered event never raises a second one. Clicking a toast shows the window and asks it to open the bell panel.
 */

/** How many shown notification ids are remembered for deduplication. */
export const HUB_TOAST_MEMORY = 200;

const SEVERITY_LABEL: Readonly<Record<HubNotificationSeverity, string>> = { info: 'Info', warning: 'Warning', error: 'Error' };

export interface HubToast {
  readonly title: string;
  readonly body: string;
}

export interface HubToastDeps {
  preferences(): HubNotificationPreferences;
  supported(): boolean;
  /** Shows the toast; `onClick` runs when the user clicks it. */
  show(toast: HubToast, onClick: () => void): void;
  /** Brings the window forward and asks the renderer to open the bell panel. */
  openPanel(): void;
}

export type HubToastOutcome = 'shown' | 'invalid' | 'duplicate' | 'off' | 'unsupported';

/** Returns the handler for one pushed `hub.notification` payload. Pure apart from its injected dependencies. */
export function createHubToastHandler(deps: HubToastDeps, memory: number = HUB_TOAST_MEMORY): (payload: unknown) => HubToastOutcome {
  const shown = new Set<string>();
  return (payload) => {
    const event = parseNotificationEvent(payload);
    if (event === null) return 'invalid';
    if (shown.has(event.id)) return 'duplicate';
    if (deps.preferences()[event.kind] !== true) return 'off';
    if (!deps.supported()) return 'unsupported';
    // Remembered only once it is shown, so turning a kind on later still announces a notification that arrives again.
    shown.add(event.id);
    while (shown.size > memory) shown.delete(shown.values().next().value as string);
    deps.show({ title: event.title, body: `${SEVERITY_LABEL[event.severity]} · DUDE Hub notification` }, () => deps.openPanel());
    return 'shown';
  };
}

/** Subscribes to the agent's push frames and raises toasts for the kinds this device opted into. Returns the unsubscribe function. */
export function installHubNotificationToasts(window: BrowserWindow, host: () => DeviceStoreHost | null): () => void {
  // Electron drops a notification (and its click handler) when it is garbage collected, so hold each one until it is clicked or closed.
  const live = new Set<Notification>();
  const handle = createHubToastHandler({
    preferences: () => getDesktopPreferences().hubNotifications,
    supported: () => Notification.isSupported(),
    show: (toast, onClick) => {
      const notification = new Notification({ title: toast.title, body: toast.body });
      live.add(notification);
      const release = (): void => { live.delete(notification); };
      notification.on('click', () => { release(); onClick(); });
      notification.on('close', release);
      notification.on('failed', release);
      notification.show();
    },
    openPanel: () => {
      if (window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      if (!window.webContents.isDestroyed()) window.webContents.send('dude:hub:openNotifications');
    },
  });
  return host()?.onEvent?.((frame) => {
    if (frame.event === 'hub.notification') handle(frame.notification);
  }) ?? (() => undefined);
}
