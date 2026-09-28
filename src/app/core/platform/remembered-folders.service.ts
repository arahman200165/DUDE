import { Injectable, signal } from '@angular/core';
import type { RememberedFolder } from '../../../shared-logic/fs/fs-types';

/**
 * Renderer view of the desktop's remembered folders (Phase 29, Milestone 523): folders the user
 * explicitly asked DUDE to keep granted across restarts. Remembering requires a prior native-picker
 * grant this session (enforced in `electron/fs-grants.ts`); forgetting stops persistence and any
 * background watch on it, but leaves the current session's grant in place.
 */
@Injectable({ providedIn: 'root' })
export class RememberedFoldersService {
  readonly folders = signal<readonly RememberedFolder[]>([]);
  readonly error = signal('');

  get available(): boolean { return !!window.dude?.fs?.listRemembered; }

  async refresh(): Promise<void> {
    if (!this.available) return;
    this.folders.set(await window.dude!.fs.listRemembered());
  }

  async remember(path: string): Promise<boolean> {
    if (!this.available) return false;
    const result = await window.dude!.fs.remember(path);
    if (!result.ok) { this.error.set(result.error); return false; }
    this.error.set('');
    this.folders.set(result.folders);
    return true;
  }

  async forget(path: string): Promise<void> {
    if (!this.available) return;
    const result = await window.dude!.fs.forget(path);
    if (result.ok) this.folders.set(result.folders);
  }

  isRemembered(path: string): boolean {
    const key = path.toLowerCase();
    return this.folders().some((folder) => folder.path.toLowerCase() === key);
  }
}
