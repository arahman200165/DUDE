import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { WatchEntry, WatchSettings, WatchState } from './network-types';

/**
 * Renderer view of the main-process Certificate Watch List (Phase 28 items 17, 24). All state lives
 * in the main process so background checks work with the window hidden; this service mirrors it and
 * forwards mutations over IPC. On the web there is no bridge, so the tool shows a desktop handoff.
 */
@Injectable({ providedIn: 'root' })
export class CertificateWatchService {
  private readonly destroyRef = inject(DestroyRef);
  readonly state = signal<WatchState | null>(null);
  readonly error = signal('');
  private unsubscribe: (() => void) | null = null;

  private get bridge() {
    const watch = window.dude?.network?.watch;
    if (!watch) throw new Error('The Certificate Watch List is available in Desktop DUDE.');
    return watch;
  }

  get available(): boolean { return !!window.dude?.network?.watch; }

  async load(): Promise<void> {
    if (!this.available) return;
    const result = await this.bridge.get();
    if (result.ok) this.state.set(result.state);
    if (!this.unsubscribe) {
      this.unsubscribe = this.bridge.onChanged((state) => this.state.set(state));
      this.destroyRef.onDestroy(() => this.unsubscribe?.());
    }
  }

  private async run<T extends { ok: boolean; error?: string; state?: WatchState }>(action: () => Promise<T>): Promise<T | null> {
    try {
      this.error.set('');
      const result = await action();
      if (!result.ok) { this.error.set(result.error ?? 'Action failed.'); return null; }
      if (result.state) this.state.set(result.state);
      return result;
    } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); return null; }
  }

  upsert(entry: Partial<WatchEntry>): Promise<unknown> { return this.run(() => this.bridge.upsert(entry)); }
  remove(id: string): Promise<unknown> { return this.run(() => this.bridge.remove(id)); }
  setSettings(settings: Partial<WatchSettings>): Promise<unknown> { return this.run(() => this.bridge.setSettings(settings)); }
  checkNow(id?: string): Promise<unknown> { return this.run(() => this.bridge.checkNow(id)); }
  async clearAll(): Promise<void> {
    const prepared = await this.run(() => this.bridge.clearPrepare());
    if (prepared && 'token' in prepared) await this.run(() => this.bridge.clearConfirm((prepared as { token: string }).token));
  }
  async exportJson(): Promise<string | null> { const result = await this.run(() => this.bridge.export()); return result && 'json' in result ? (result as { json: string }).json : null; }
  importJson(json: string): Promise<unknown> { return this.run(() => this.bridge.import(json)); }
}
