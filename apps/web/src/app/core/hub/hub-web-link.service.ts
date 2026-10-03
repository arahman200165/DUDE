import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { PlatformService } from '../platform/platform.service';
import { HUB_ADMIN } from './hub-admin.token';
import { HubAdminError } from './hub-admin.port';

/**
 * Desktop only: whether this device is enrolled with a Hub, and the "Open Hub web" action. The renderer never supplies
 * a URL; main resolves the enrolled Hub address and only opens `https:` (PD-062). Inert on the web hosts.
 */
@Injectable({ providedIn: 'root' })
export class HubWebLinkService {
  private readonly hub = inject(HUB_ADMIN);
  private readonly desktop = inject(PlatformService).hostKind === 'desktop';
  private readonly enrolledSignal = signal(false);

  /** True on desktop while enrolled and the host can open the Hub's web page. */
  readonly canOpen = computed(() => this.desktop && this.enrolledSignal() && this.hub.openWeb !== undefined);

  constructor() {
    if (!this.desktop) return;
    void this.refresh();
    const stop = this.hub.onStatusChanged?.((status) => this.enrolledSignal.set(status.enrollmentState === 'enrolled'));
    if (stop) inject(DestroyRef).onDestroy(stop);
  }

  async refresh(): Promise<void> {
    try {
      this.enrolledSignal.set((await this.hub.status()).enrollmentState === 'enrolled');
    } catch {
      this.enrolledSignal.set(false);
    }
  }

  /** Rejects with `HubAdminError` (`not-enrolled`, `invalid-url`, ...). */
  async open(): Promise<void> {
    if (!this.hub.openWeb) throw new HubAdminError('unavailable', 'This host cannot open the Hub web page.');
    await this.hub.openWeb();
  }
}
