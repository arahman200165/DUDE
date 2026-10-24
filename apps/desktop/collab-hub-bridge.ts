import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { parseCollabRelayFrame } from '@dude/contracts';
import type { CollabRelayFrame, CollabRelayState } from '@dude/contracts';
import type { DesktopHubResult } from '@dude/contracts/shared/models/platform-bridge.model';
import { DeviceStoreError } from './device-store/agent-host';
import type { DeviceStoreHost } from './device-store/agent-host';
import { getDeviceStoreHost } from './device-store/store-client';

/**
 * Hub collaboration relay for the renderer (PD-106): `dude:collab-hub:open|send|close` and the pushes `dude:collab-hub:frame|state`.
 * The Y.Doc and the editor live in the renderer; the Device Agent holds the pinned collaboration socket; this module only passes opaque
 * frames between them. Main is the trust boundary: every call is accepted only from this window's own `webContents`, takes exactly the
 * arguments listed, and a frame is validated and size-capped (`parseCollabRelayFrame`: a control frame at most `COLLAB_MAX_CONTROL_BYTES`,
 * a binary frame at most `COLLAB_MAX_FRAME_BYTES` decoded) before it reaches the Agent, which checks the content again. Agent pushes are
 * validated by `parseAgentEvent` and reach only this window. Nothing is stored or logged, and no error carries a stack.
 */

const FORBIDDEN = 'forbidden';
const BAD_REQUEST = 'bad-request';
const COLLAB_PUSH_CHANNELS = { frame: 'dude:collab-hub:frame', state: 'dude:collab-hub:state' } as const;

const fail = (code: string, message: string): DesktopHubResult<never> => ({ ok: false, error: { code, message } });

export function registerCollabHubHandlers(window: BrowserWindow, host: () => DeviceStoreHost | null = getDeviceStoreHost): void {
  const own = (sender: unknown): boolean => sender === window.webContents;
  /** Whether this window asked the Agent for the socket and has not let go: only then does a lost Agent need reporting. */
  let held = false;

  const push = (channel: string, payload: CollabRelayFrame | CollabRelayState): void => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(channel, payload);
  };

  const relay = async <T>(run: (h: DeviceStoreHost) => Promise<T>): Promise<DesktopHubResult<T>> => {
    const h = host();
    if (!h) return fail('unavailable', 'The device agent is not running.');
    try {
      return { ok: true, result: await run(h) };
    } catch (error) {
      if (error instanceof DeviceStoreError) return fail(error.code, error.message);
      return fail('internal', 'The collaboration request failed.');
    }
  };

  ipcMain.handle('dude:collab-hub:open', async (event, ...args: unknown[]) => {
    if (!own(event.sender)) return fail(FORBIDDEN, FORBIDDEN);
    if (args.length !== 0) return fail(BAD_REQUEST, 'Invalid request.');
    const result = await relay((h) => h.call('collab.open', {}));
    // A refusal holds nothing; an error leaves the previous hold as it was (the Agent decides what a failed call means).
    if (result.ok) held = result.result.ok;
    return result;
  });

  ipcMain.handle('dude:collab-hub:send', async (event, ...args: unknown[]) => {
    if (!own(event.sender)) return fail(FORBIDDEN, FORBIDDEN);
    if (args.length !== 1) return fail(BAD_REQUEST, 'Invalid request.');
    const frame = parseCollabRelayFrame(args[0]);
    if (frame === null) return fail(BAD_REQUEST, 'Invalid request.');
    return relay((h) => h.call('collab.send', frame));
  });

  ipcMain.handle('dude:collab-hub:close', async (event, ...args: unknown[]) => {
    if (!own(event.sender)) return fail(FORBIDDEN, FORBIDDEN);
    if (args.length !== 0) return fail(BAD_REQUEST, 'Invalid request.');
    held = false;
    return relay((h) => h.call('collab.close', {}));
  });

  host()?.onEvent?.((frame) => {
    if (frame.event === 'collab.frame') {
      push(COLLAB_PUSH_CHANNELS.frame, frame.kind === 'control' ? { kind: 'control', text: frame.text } : { kind: 'binary', base64: frame.base64 });
      return;
    }
    if (frame.event !== 'collab.state') return;
    // A state that ends the hold (displaced, a permanent refusal) means nothing more to report if the Agent later goes away.
    if (frame.state === 'closed' && frame.willRetry !== true) held = false;
    push(COLLAB_PUSH_CHANNELS.state, {
      state: frame.state,
      ...(frame.code === undefined ? {} : { code: frame.code }),
      ...(frame.reason === undefined ? {} : { reason: frame.reason }),
      ...(frame.willRetry === undefined ? {} : { willRetry: frame.willRetry }),
    });
  });

  // The Agent dying (crash, restart, the user stopping it) takes the socket with it and no state push can arrive: tell the renderer, which opens again.
  host()?.onHealth?.(() => {
    const h = host();
    if (!held || (h !== null && h.agentRunning())) return;
    held = false;
    push(COLLAB_PUSH_CHANNELS.state, { state: 'closed', reason: 'agent-unavailable', willRetry: false });
  });

  // A crashed renderer cannot say goodbye: let the Agent's linger close the socket.
  window.webContents.on('render-process-gone', () => {
    if (!held) return;
    held = false;
    void relay((h) => h.call('collab.close', {}));
  });
}
