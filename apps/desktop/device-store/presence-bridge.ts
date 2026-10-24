import { ipcMain, type BrowserWindow } from 'electron';
import { PRESENCE_DESTINATIONS } from '@dude/contracts/hub';
import type { PresenceActivity } from '@dude/contracts/hub';
import type { DesktopHubResult } from '@dude/contracts/shared/models/platform-bridge.model';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { getDeviceStoreHost } from './store-client';

/**
 * Presence for the renderer (PD-108): `dude:presence:setActivity`. The renderer calls it only while the device-local
 * `__device__:presenceShareActivity` setting is on, with what it is showing (a tool id or a shell destination) or `null` to
 * clear it. Main is the trust boundary: it accepts the call only from this window's own `webContents`, accepts exactly one
 * argument that is `null` or a closed `{ kind: 'tool', id }` / `{ kind: 'destination', id }` shape, and forwards it to the
 * Device Agent, which sends it on its realtime socket. Nothing is stored, logged or returned beyond `{ ok: true }`.
 */

const FORBIDDEN = 'forbidden';
const TOOL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DESTINATIONS: ReadonlySet<string> = new Set(PRESENCE_DESTINATIONS);

const fail = (code: string, message: string): DesktopHubResult<never> => ({ ok: false, error: { code, message } });

/** The activity when `value` is exactly a valid `PresenceActivity`; undefined for anything else (null is handled by the caller). */
export function parseActivity(value: unknown): PresenceActivity | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  const keys = Object.keys(value);
  const { kind, id } = value as { kind?: unknown; id?: unknown };
  if (keys.length !== 2 || !keys.includes('kind') || !keys.includes('id') || typeof id !== 'string') return undefined;
  if (kind === 'tool' && TOOL_ID.test(id)) return { kind: 'tool', id };
  if (kind === 'destination' && DESTINATIONS.has(id)) return { kind: 'destination', id: id as (typeof PRESENCE_DESTINATIONS)[number] };
  return undefined;
}

export function registerPresenceHandlers(window: BrowserWindow, host: () => DeviceStoreHost | null = getDeviceStoreHost): void {
  ipcMain.handle('dude:presence:setActivity', async (event, ...args: unknown[]): Promise<DesktopHubResult<{ readonly ok: true }>> => {
    if (event.sender !== window.webContents) return fail(FORBIDDEN, 'forbidden');
    if (args.length !== 1) return fail('bad-request', 'Invalid request.');
    const activity = args[0] === null ? null : parseActivity(args[0]);
    if (activity === undefined) return fail('bad-request', 'Invalid request.');
    const h = host();
    if (!h) return fail('unavailable', 'The device agent is not running.');
    try {
      await h.call('presence.setActivity', { activity });
      return { ok: true, result: { ok: true } };
    } catch (error) {
      if (error instanceof DeviceStoreError) return fail(error.code, error.message);
      return fail('internal', 'The presence request failed.');
    }
  });
}
