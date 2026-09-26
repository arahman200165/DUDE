import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/**
 * Crash detection (DUDE_PRD.md §21 Phase 25 Item 6) -- mirrors `window-state.ts`'s shape exactly: a
 * small JSON marker under `userData`, written at `whenReady()` and flipped back to `true` by the
 * existing `before-quit` handler (`tray.ts`). An unclean exit (crash, force-kill, OS shutdown) is
 * simply "the marker still says false at next launch" -- nothing more elaborate than that.
 */
function path(): string {
  return join(app.getPath('userData'), 'crash-state.json');
}

async function readCleanExit(): Promise<boolean> {
  try {
    const stored = JSON.parse(await fs.readFile(path(), 'utf8')) as { cleanExit: boolean };
    return stored.cleanExit;
  } catch {
    return true; // First launch has no prior record -- nothing to report.
  }
}

async function writeCleanExit(cleanExit: boolean): Promise<void> {
  await fs.writeFile(path(), JSON.stringify({ cleanExit }), 'utf8').catch(() => {});
}

/**
 * Call once during `whenReady()`, before `createWindow()`. Returns whether the *previous* launch
 * exited uncleanly, then immediately marks the new one unclean until `markCleanExit()` runs.
 */
export async function checkAndMarkLaunch(): Promise<boolean> {
  const wasClean = await readCleanExit();
  await writeCleanExit(false);
  return !wasClean;
}

/** Call from the existing `app.on('before-quit', ...)` handler (`tray.ts`). */
export function markCleanExit(): void {
  void writeCleanExit(true);
}
