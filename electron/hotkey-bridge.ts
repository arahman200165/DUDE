import { app, clipboard, globalShortcut, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { decodeBase64, encodeBase64 } from '../src/shared-logic/base64-codec';
import { computeHash } from '../src/shared-logic/hash-compute';

/**
 * Global-hotkey clipboard quick-actions (Phase 8 Stage 5). A small,
 * main-process-resident registry — one array, one place to add an entry,
 * mirroring `tool-definitions.ts`'s registry-driven spirit for actions
 * instead of tools. Each action's transform logic is imported from
 * `src/shared-logic/` (see that directory's `AGENTS.md`) rather than
 * duplicated here or reached into `src/app/tools/` directly.
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

function bindingsPath(): string {
  return join(app.getPath('userData'), 'hotkey-bindings.json');
}

async function loadPersistedBindings(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(bindingsPath(), 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

async function savePersistedBindings(): Promise<void> {
  await fs.writeFile(bindingsPath(), JSON.stringify(Object.fromEntries(bindings)), 'utf8');
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
