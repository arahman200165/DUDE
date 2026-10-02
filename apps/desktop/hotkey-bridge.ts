import { clipboard, globalShortcut, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { loadDoc, saveDoc } from './device-store/device-docs';
import { decodeBase64, encodeBase64 } from "@dude/crypto/base64-codec";
import { computeHash } from "@dude/crypto/hash-compute";

/**
 * Global-hotkey clipboard quick-actions (Phase 8 Stage 5). A small,
 * main-process-resident registry — one array, one place to add an entry,
 * mirroring `tool-definitions.ts`'s registry-driven spirit for actions
 * instead of tools. Each action's transform logic is imported from
 * `apps/web/src/shared-logic/` (see that directory's `AGENTS.md`) rather than
 * duplicated here or reached into `apps/web/src/app/tools/` directly.
 *
 * Runs even when the DUDE window isn't focused (that's the point of a
 * global shortcut) — so actions only ever touch the clipboard, never fs/
 * network, keeping them safe to run unattended.
 */

interface QuickAction {
  readonly id: string;
  readonly label: string;
  run(): void | Promise<void>;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: 'base64-encode-clipboard',
    label: 'Base64 Encode Clipboard',
    run: async () => {
      const result = encodeBase64(await clipboard.readText());
      if (result.ok) clipboard.writeText(result.value);
    },
  },
  {
    id: 'base64-decode-clipboard',
    label: 'Base64 Decode Clipboard',
    run: async () => {
      const result = decodeBase64(await clipboard.readText());
      if (result.ok) clipboard.writeText(result.value);
    },
  },
  {
    id: 'uuid-generate-clipboard',
    label: 'Generate UUID to Clipboard',
    run: () => {
      clipboard.writeText(randomUUID());
    },
  },
  {
    id: 'hash-sha256-clipboard',
    label: 'SHA-256 Hash Clipboard',
    run: async () => {
      const text = await clipboard.readText();
      if (!text) return;
      clipboard.writeText(await computeHash(text, 'SHA-256'));
    },
  },
];

const bindings = new Map<string, string>(); // actionId -> Electron accelerator string

/** Legacy-import decoder: actionId -> accelerator string map. */
export function decodeHotkeyBindings(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
  return out;
}

async function loadPersistedBindings(): Promise<Record<string, string>> {
  return loadDoc('hotkey-bindings', decodeHotkeyBindings, {});
}

async function savePersistedBindings(): Promise<void> {
  await saveDoc('hotkey-bindings', Object.fromEntries(bindings));
}

function findAction(actionId: string): QuickAction | undefined {
  return QUICK_ACTIONS.find((a) => a.id === actionId);
}

/**
 * Restores previously-bound hotkeys on launch. A binding that fails to
 * register (e.g. another app already owns that accelerator) is silently
 * dropped from the in-memory map — not from disk — so `list()` correctly
 * reports it as unbound and Settings › Hotkeys can surface "couldn't
 * register" and let the user re-bind, rather than a permanent silent
 * no-op.
 */
export async function registerHotkeyHandlers(): Promise<void> {
  const persisted = await loadPersistedBindings();
  for (const [actionId, accelerator] of Object.entries(persisted)) {
    const action = findAction(actionId);
    if (!action) continue;
    if (globalShortcut.register(accelerator, () => void action.run())) {
      bindings.set(actionId, accelerator);
    }
  }

  ipcMain.handle('dude:quickActions:list', () => {
    return QUICK_ACTIONS.map((action) => ({ id: action.id, label: action.label, hotkey: bindings.get(action.id) ?? null }));
  });

  ipcMain.handle('dude:quickActions:run', async (_event, actionId: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
    const action = typeof actionId === 'string' ? findAction(actionId) : undefined;
    if (!action) return { ok: false, error: 'unknown-action' };
    try {
      await action.run();
      return { ok: true };
    } catch {
      return { ok: false, error: 'action-failed' };
    }
  });

  ipcMain.handle(
    'dude:quickActions:setHotkey',
    async (_event, actionId: string, accelerator: string | null): Promise<{ ok: true } | { ok: false; error: string }> => {
      const action = findAction(actionId);
      if (!action) return { ok: false, error: 'unknown-action' };

      const existing = bindings.get(actionId);
      if (existing) {
        globalShortcut.unregister(existing);
        bindings.delete(actionId);
      }

      if (!accelerator) {
        await savePersistedBindings();
        return { ok: true };
      }

      if (!globalShortcut.register(accelerator, () => void action.run())) {
        return { ok: false, error: 'registration-failed' };
      }

      bindings.set(actionId, accelerator);
      await savePersistedBindings();
      return { ok: true };
    },
  );
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll();
}
