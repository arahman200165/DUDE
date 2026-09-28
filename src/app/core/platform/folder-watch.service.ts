import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { ChangeEvent, FolderWatchSettings, FolderWatchState, TimelineQuery, WatchedFolder } from '../../../shared-logic/fs/watch-types';

/**
 * Renderer mirror of the desktop's background folder watches (`electron/fs-watch-service.ts`,
 * Phase 29 Milestone 534). State lives in the main process so watching continues with the window
 * hidden to the tray; this service subscribes to changes and forwards edits over IPC.
 */
@Injectable({ providedIn: 'root' })
export class FolderWatchService {
  private readonly destroyRef = inject(DestroyRef);
  readonly state = signal<FolderWatchState | null>(null);
  readonly error = signal('');
  private unsubscribe: (() => void) | null = null;

  get available(): boolean { return !!window.dude?.fsWatch; }

  private get bridge() {
    const bridge = window.dude?.fsWatch;
    if (!bridge) throw new Error('Folder watching is available in Desktop DUDE.');
    return bridge;
  }

  private async run(action: () => Promise<{ ok: true; value: FolderWatchState } | { ok: false; error: string }>): Promise<boolean> {
    try {
      const result = await action();
      if (!result.ok) { this.error.set(result.error); return false; }
      this.error.set('');
      this.state.set(result.value);
      return true;
    } catch (caught) { this.error.set(caught instanceof Error ? caught.message : String(caught)); return false; }
  }

  async load(): Promise<void> {
    if (!this.available) return;
    await this.run(() => this.bridge.get());
    if (!this.unsubscribe) {
      this.unsubscribe = this.bridge.onChanged((state) => this.state.set(state));
      this.destroyRef.onDestroy(() => this.unsubscribe?.());
    }
  }

  add(path: string, folder: Partial<WatchedFolder> = {}): Promise<boolean> { return this.run(() => this.bridge.add(path, folder)); }
  update(id: string, patch: Partial<WatchedFolder>): Promise<boolean> { return this.run(() => this.bridge.update(id, patch)); }
  remove(id: string): Promise<boolean> { return this.run(() => this.bridge.remove(id)); }
  setSettings(patch: Partial<FolderWatchSettings>): Promise<boolean> { return this.run(() => this.bridge.setSettings(patch)); }
  clearTimeline(id: string): Promise<boolean> { return this.run(() => this.bridge.clearTimeline(id)); }
  clearContent(id: string): Promise<boolean> { return this.run(() => this.bridge.clearContent(id)); }

  async timeline(query: TimelineQuery): Promise<readonly ChangeEvent[]> {
    const result = await this.bridge.timeline(query);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  async content(id: string, hash: string): Promise<{ size: number; text: string | null; binary: boolean }> {
    const result = await this.bridge.content(id, hash);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }
}
