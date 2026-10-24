const mock = vi.hoisted(() => ({
  shown: [] as Array<{ options: { title: string; body: string }; listeners: Map<string, () => void> }>,
  supported: true,
  prefs: { hubNotifications: {} as Record<string, boolean> },
}));

vi.mock('electron', () => ({
  Notification: class {
    static isSupported(): boolean { return mock.supported; }
    readonly listeners = new Map<string, () => void>();
    constructor(readonly options: { title: string; body: string }) {}
    on(event: string, listener: () => void): this { this.listeners.set(event, listener); return this; }
    show(): void { mock.shown.push(this); }
  },
}));
vi.mock('./desktop-preferences', () => ({ getDesktopPreferences: () => mock.prefs }));

import { defaultHubNotificationPreferences } from '@dude/contracts/hub';
import type { AgentEvent } from '@dude/contracts';
import type { DeviceStoreHost } from './device-store/agent-host';
import { HUB_TOAST_MEMORY, createHubToastHandler, installHubNotificationToasts } from './hub-notification-toasts';
import type { HubToast, HubToastDeps } from './hub-notification-toasts';

const event = (id: string, kind = 'backup-failed', severity = 'error', title = 'Backup failed') => ({ id, kind, severity, title });

function harness(on: readonly string[] = ['backup-failed'], supported = true) {
  const shown: Array<{ toast: HubToast; click: () => void }> = [];
  let opened = 0;
  const deps: HubToastDeps = {
    preferences: () => ({ ...defaultHubNotificationPreferences(), ...Object.fromEntries(on.map((kind) => [kind, true])) }),
    supported: () => supported,
    show: (toast, click) => { shown.push({ toast, click }); },
    openPanel: () => { opened++; },
  };
  return { deps, shown, opened: () => opened };
}

describe('hub toast handler (PD-110)', () => {
  it('raises a toast with the title and the severity for a kind that is on', () => {
    const h = harness();
    expect(createHubToastHandler(h.deps)(event('n1'))).toBe('shown');
    expect(h.shown).toHaveLength(1);
    expect(h.shown[0]!.toast.title).toBe('Backup failed');
    expect(h.shown[0]!.toast.body).toContain('Error');
  });

  it('raises nothing for a kind that is off, which is every kind by default', () => {
    const h = harness([]);
    const handle = createHubToastHandler(h.deps);
    expect(handle(event('n1'))).toBe('off');
    expect(handle(event('n2', 'security-alert', 'warning', 'Alert'))).toBe('off');
    expect(h.shown).toEqual([]);
  });

  it('filters per kind', () => {
    const h = harness(['security-alert']);
    const handle = createHubToastHandler(h.deps);
    expect(handle(event('n1', 'backup-failed'))).toBe('off');
    expect(handle(event('n2', 'security-alert', 'warning', 'Sign-in from a new device'))).toBe('shown');
    expect(h.shown.map((s) => s.toast.title)).toEqual(['Sign-in from a new device']);
  });

  it('drops a malformed payload', () => {
    const h = harness();
    const handle = createHubToastHandler(h.deps);
    for (const payload of [null, 'x', [], {}, event('', 'backup-failed'), event('n1', 'nope'), event('n1', 'backup-failed', 'fatal'), event('n1', 'backup-failed', 'error', 'x'.repeat(121))]) {
      expect(handle(payload)).toBe('invalid');
    }
    expect(h.shown).toEqual([]);
  });

  it('shows a redelivered id once', () => {
    const h = harness();
    const handle = createHubToastHandler(h.deps);
    expect(handle(event('n1'))).toBe('shown');
    expect(handle(event('n1'))).toBe('duplicate');
    expect(handle(event('n2'))).toBe('shown');
    expect(h.shown).toHaveLength(2);
  });

  it('does not remember an id it did not show', () => {
    let on = false;
    const shown: HubToast[] = [];
    const handle = createHubToastHandler({ preferences: () => ({ ...defaultHubNotificationPreferences(), 'backup-failed': on }), supported: () => true, show: (t) => { shown.push(t); }, openPanel: () => undefined });
    expect(handle(event('n1'))).toBe('off');
    on = true;
    expect(handle(event('n1'))).toBe('shown');
    expect(shown).toHaveLength(1);
  });

  it('stays quiet where OS notifications are unsupported', () => {
    const h = harness(['backup-failed'], false);
    expect(createHubToastHandler(h.deps)(event('n1'))).toBe('unsupported');
    expect(h.shown).toEqual([]);
  });

  it('bounds what it remembers: the oldest id is forgotten first', () => {
    const h = harness();
    const handle = createHubToastHandler(h.deps, 3);
    for (const id of ['a', 'b', 'c', 'd']) expect(handle(event(id))).toBe('shown');
    expect(handle(event('d'))).toBe('duplicate');
    expect(handle(event('c'))).toBe('duplicate');
    expect(handle(event('a'))).toBe('shown');
    expect(HUB_TOAST_MEMORY).toBe(200);
  });

  it('opens the panel when the toast is clicked, and only then', () => {
    const h = harness();
    createHubToastHandler(h.deps)(event('n1'));
    expect(h.opened()).toBe(0);
    h.shown[0]!.click();
    expect(h.opened()).toBe(1);
  });
});

describe('installHubNotificationToasts', () => {
  const listeners = new Set<(frame: AgentEvent) => void>();
  const host = { onEvent: (l: (frame: AgentEvent) => void) => { listeners.add(l); return () => { listeners.delete(l); }; } } as unknown as DeviceStoreHost;
  const send = vi.fn();
  const window = { isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn(), webContents: { isDestroyed: () => false, send } } as any;
  const push = (frame: unknown): void => listeners.forEach((l) => l(frame as AgentEvent));

  beforeEach(() => {
    mock.shown.length = 0;
    mock.supported = true;
    mock.prefs = { hubNotifications: { ...defaultHubNotificationPreferences(), 'backup-failed': true } };
    listeners.clear();
    send.mockClear();
    window.restore.mockClear(); window.show.mockClear(); window.focus.mockClear();
  });

  it('raises an OS notification for a live hub.notification frame without touching the window', () => {
    installHubNotificationToasts(window, () => host);
    push({ type: 'event', event: 'hub.notification', notification: event('n1') });
    expect(mock.shown).toHaveLength(1);
    expect(mock.shown[0]!.options.title).toBe('Backup failed');
    expect(send).not.toHaveBeenCalled();
    expect(window.show).not.toHaveBeenCalled();
  });

  it('ignores other frames and kinds that are off', () => {
    installHubNotificationToasts(window, () => host);
    push({ type: 'event', event: 'hub.status', status: {} });
    push({ type: 'event', event: 'hub.viewChanged', topic: 'notifications' });
    push({ type: 'event', event: 'hub.notification', notification: event('n2', 'security-alert', 'warning', 'Alert') });
    expect(mock.shown).toEqual([]);
  });

  it('shows and focuses the window and asks the renderer to open the bell panel on click', () => {
    installHubNotificationToasts(window, () => host);
    push({ type: 'event', event: 'hub.notification', notification: event('n1') });
    mock.shown[0]!.listeners.get('click')!();
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(send.mock.calls).toEqual([['dude:hub:openNotifications']]);
  });

  it('does not duplicate a redelivered notification and unsubscribes', () => {
    const off = installHubNotificationToasts(window, () => host);
    push({ type: 'event', event: 'hub.notification', notification: event('n1') });
    push({ type: 'event', event: 'hub.notification', notification: event('n1') });
    expect(mock.shown).toHaveLength(1);
    off();
    push({ type: 'event', event: 'hub.notification', notification: event('n3') });
    expect(mock.shown).toHaveLength(1);
  });

  it('is inert while the agent host is not running', () => {
    expect(() => installHubNotificationToasts(window, () => null)()).not.toThrow();
  });
});
