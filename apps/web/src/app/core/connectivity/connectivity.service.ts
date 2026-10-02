import { Injectable, OnDestroy, signal } from '@angular/core';

/**
 * The app-wide "offline state primitive" (PRD Section 11/25.4). Wraps the
 * browser's `online`/`offline` window events in a signal so the rest of the
 * app never touches `navigator.onLine` or window listeners directly.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService implements OnDestroy {
  private readonly onlineSignal = signal(navigator.onLine);

  readonly online = this.onlineSignal.asReadonly();

  private readonly handleOnline = () => this.onlineSignal.set(true);
  private readonly handleOffline = () => this.onlineSignal.set(false);

  constructor() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }
}
