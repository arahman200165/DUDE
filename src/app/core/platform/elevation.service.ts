import { Injectable, signal } from '@angular/core';

/** Session elevation state and the deliberate Relaunch as Administrator action. Desktop only; `null` = unknown/web. */
@Injectable({ providedIn: 'root' })
export class ElevationService {
  readonly elevated = signal<boolean | null>(null);

  async refresh(): Promise<void> {
    const elevation = window.dude?.elevation;
    if (!elevation) { this.elevated.set(null); return; }
    try { this.elevated.set(await elevation.status()); } catch { /* keep the previous value */ }
  }

  /** Resolves true when Windows accepted the elevation prompt (the current app then closes). */
  async relaunch(): Promise<boolean> {
    const elevation = window.dude?.elevation;
    if (!elevation) throw new Error('Windows system tools are available in Desktop DUDE.');
    return elevation.relaunch();
  }
}
