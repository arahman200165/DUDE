import { ipcMain, type BrowserWindow } from 'electron';
import type { AgentMethod, AgentMethodMap } from '@dude/contracts';
import { SYNC_WIRE_CATEGORY_IDS } from '@dude/contracts/hub';
import type { DesktopHubResult } from '@dude/contracts/shared/models/platform-bridge.model';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';
import { getDeviceStoreHost } from './store-client';

/**
 * Sync for the renderer: `dude:sync:<method>` (one per `DesktopSyncBridge` method) and the `dude:sync:statusChanged` /
 * `dude:sync:applied` pushes. Main is the trust boundary: each handler checks the sender is this window's own
 * `webContents`, strictly validates the payload (exact arity, closed category keys and choice enums, bounded ids) and
 * only then calls the Device Agent. Failures become `{ ok: false, error: { code, message } }`, never a stack trace.
 * Results and applied changes carry the user's own content (pipelines, notes, settings), which the renderer needs
 * verbatim, so nothing is scrubbed and nothing here is ever logged. No Hub credential passes through this bridge.
 */

const FORBIDDEN = 'forbidden';
const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
const DIGEST = /^[A-Za-z0-9_.:=+/-]{1,256}$/;
const MAX_OP_IDS = 1000;
const CATEGORIES: ReadonlySet<string> = new Set(SYNC_WIRE_CATEGORY_IDS);
const CONFLICT_CHOICES: ReadonlySet<unknown> = new Set(['hub', 'mine', 'both']);
const FIRST_SYNC_CHOICES: ReadonlySet<unknown> = new Set(['merge', 'use-hub', 'keep-local']);

type Fail = { readonly ok: false; readonly code: string; readonly message: string };
type Parsed<P> = { readonly ok: true; readonly params: P } | Fail;
const bad = (message = 'Invalid request.'): Fail => ({ ok: false, code: 'bad-request', message });
const fail = (code: string, message: string): DesktopHubResult<never> => ({ ok: false, error: { code, message } });

const idArg = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
const tokenArg = (v: unknown): v is string => typeof v === 'string' && TOKEN.test(v);
const digestArg = (v: unknown): v is string => typeof v === 'string' && DIGEST.test(v);
const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** A non-empty map whose keys are all known category ids and whose values satisfy `valid`; null when it is anything else. */
function categoryMap<V>(value: unknown, valid: (v: unknown) => v is V): Record<string, V> | null {
  if (!isPlainObject(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > CATEGORIES.size) return null;
  const out: Record<string, V> = {};
  for (const [key, item] of entries) {
    if (!CATEGORIES.has(key) || !valid(item)) return null;
    out[key] = item;
  }
  return out;
}

interface Definition<M extends AgentMethod> {
  readonly channel: string;
  readonly method: M;
  readonly parse: (args: readonly unknown[]) => Parsed<AgentMethodMap[M]['params']>;
}

const none = (args: readonly unknown[]): Parsed<Record<string, never>> => (args.length === 0 ? { ok: true, params: {} } : bad());
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isFirstSyncChoice = (v: unknown): v is 'merge' | 'use-hub' | 'keep-local' => FIRST_SYNC_CHOICES.has(v);

export function registerSyncHandlers(window: BrowserWindow, host: () => DeviceStoreHost | null = getDeviceStoreHost): void {
  const own = (sender: unknown): boolean => sender === window.webContents;

  const define = <M extends AgentMethod>(def: Definition<M>): void => {
    ipcMain.handle(def.channel, async (event, ...args: unknown[]): Promise<DesktopHubResult<AgentMethodMap[M]['result']>> => {
      if (!own(event.sender)) return fail(FORBIDDEN, 'forbidden');
      const parsed = def.parse(args);
      if (!parsed.ok) return fail(parsed.code, parsed.message);
      const h = host();
      if (!h) return fail('unavailable', 'The device agent is not running.');
      try {
        return { ok: true, result: await h.call(def.method, parsed.params) };
      } catch (error) {
        if (error instanceof DeviceStoreError) return fail(error.code, error.message);
        return fail('internal', 'The sync request failed.');
      }
    });
  };

  define({ channel: 'dude:sync:status', method: 'sync.status', parse: none });

  define({
    channel: 'dude:sync:setCategories', method: 'sync.setCategories',
    parse: (args) => {
      if (args.length !== 1) return bad();
      const categories = categoryMap(args[0], isBoolean);
      return categories ? { ok: true, params: { categories } } : bad('Invalid categories.');
    },
  });

  define({
    channel: 'dude:sync:setPaused', method: 'sync.setPaused',
    parse: (args) => (args.length === 1 && isBoolean(args[0]) ? { ok: true, params: { paused: args[0] } } : bad()),
  });

  define({ channel: 'dude:sync:now', method: 'sync.now', parse: none });
  define({ channel: 'dude:sync:conflicts:list', method: 'sync.conflicts.list', parse: none });

  define({
    channel: 'dude:sync:conflicts:resolve', method: 'sync.conflicts.resolve',
    parse: (args) => {
      if (args.length !== 2) return bad();
      const [id, choice] = args;
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || !CONFLICT_CHOICES.has(choice)) return bad();
      return { ok: true, params: { id, choice: choice as 'hub' | 'mine' | 'both' } };
    },
  });

  define({ channel: 'dude:sync:quarantine:list', method: 'sync.quarantine.list', parse: none });

  define({
    channel: 'dude:sync:quarantine:retry', method: 'sync.quarantine.retry',
    parse: (args) => {
      if (args.length > 1) return bad();
      const [opIds] = args;
      if (opIds === undefined) return { ok: true, params: {} };
      if (!Array.isArray(opIds) || opIds.length === 0 || opIds.length > MAX_OP_IDS || !opIds.every(idArg)) return bad();
      return { ok: true, params: { opIds: [...opIds] as string[] } };
    },
  });

  define({
    channel: 'dude:sync:quarantine:discardPreview', method: 'sync.quarantine.discardPreview',
    parse: (args) => (args.length === 1 && idArg(args[0]) ? { ok: true, params: { opId: args[0] } } : bad()),
  });

  define({
    channel: 'dude:sync:quarantine:discard', method: 'sync.quarantine.discard',
    parse: (args) => (args.length === 2 && idArg(args[0]) && tokenArg(args[1]) ? { ok: true, params: { opId: args[0], confirmToken: args[1] } } : bad()),
  });

  define({ channel: 'dude:sync:quarantine:export', method: 'sync.quarantine.export', parse: none });
  define({ channel: 'dude:sync:firstSync:preview', method: 'sync.firstSync.preview', parse: none });

  define({
    channel: 'dude:sync:firstSync:apply', method: 'sync.firstSync.apply',
    parse: (args) => {
      if (args.length < 2 || args.length > 3) return bad();
      const [rawChoices, digest, confirmToken] = args;
      const choices = categoryMap(rawChoices, isFirstSyncChoice);
      if (!choices || !digestArg(digest)) return bad();
      if (confirmToken === undefined) return { ok: true, params: { choices, digest } };
      return tokenArg(confirmToken) ? { ok: true, params: { choices, digest, confirmToken } } : bad();
    },
  });

  define({ channel: 'dude:sync:standalone:preview', method: 'sync.standalone.preview', parse: none });

  define({
    channel: 'dude:sync:standalone:apply', method: 'sync.standalone.apply',
    parse: (args) => (args.length === 2 && tokenArg(args[0]) && digestArg(args[1]) ? { ok: true, params: { confirmToken: args[0], digest: args[1] } } : bad()),
  });

  // Pushes: the agent reports every sync status change and every batch of locally applied remote changes.
  host()?.onEvent?.((frame) => {
    if (frame.event !== 'sync.status' && frame.event !== 'sync.applied') return;
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    if (frame.event === 'sync.status') window.webContents.send('dude:sync:statusChanged', frame.status);
    else window.webContents.send('dude:sync:applied', frame.changes);
  });
}
