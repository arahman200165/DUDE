import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, signal } from '@angular/core';
import type { RememberedFolder } from "@dude/contracts/fs/fs-types";

/**
 * Renderer view of the desktop's remembered folders (Phase 29, Milestone 523): folders the user
 * explicitly asked DUDE to keep granted across restarts. Remembering requires a prior native-picker
 * grant this session (enforced in `apps/desktop/fs-grants.ts`); forgetting stops persistence and any
 * background watch on it, but leaves the current session's grant in place.
 */
@Injectable({ providedIn: 'root' })
export class RememberedFoldersService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  readonly folders = signal<readonly RememberedFolder[]>([]);
  readonly error = signal('');

  get available(): boolean { return !!this.platformBridgePort.get()?.fs?.listRemembered; }

  async refresh(): Promise<void> {
    if (!this.available) return;
    this.folders.set(await this.platformBridgePort.get()!.fs.listRemembered());
  }

  async remember(path: string): Promise<boolean> {
    if (!this.available) return false;
    const result = await this.platformBridgePort.get()!.fs.remember(path);
    if (!result.ok) { this.error.set(result.error); return false; }
    this.error.set('');
    this.folders.set(result.folders);
    return true;
  }

  async forget(path: string): Promise<void> {
    if (!this.available) return;
    const result = await this.platformBridgePort.get()!.fs.forget(path);
    if (result.ok) this.folders.set(result.folders);
  }

  isRemembered(path: string): boolean {
    const key = path.toLowerCase();
    return this.folders().some((folder) => folder.path.toLowerCase() === key);
  }
}
