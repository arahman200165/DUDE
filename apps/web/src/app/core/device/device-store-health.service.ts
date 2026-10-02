import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { StoreHealth, StoreStatus } from '@dude/contracts';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { BOOT_SNAPSHOT } from '../persistence/device-store/boot-snapshot';

/** Health of the desktop Device Store. On web there is no store: `isDesktopStore` is false and status stays null. */
@Injectable({ providedIn: 'root' })
export class DeviceStoreHealthService {
  private readonly bridge = inject(PLATFORM_BRIDGE);
  private readonly snapshot = inject(BOOT_SNAPSHOT);

  readonly isDesktopStore = this.bridge.get()?.store !== undefined;
  private readonly statusSignal = signal<StoreStatus | null>(this.initialStatus());
  private readonly healthSignal = signal<StoreHealth | null>(null);
  /** Why this launch is not saving (hydrate timeout/failure or a non-ready store), if it is not. */
  readonly degradedReason = signal<string | null>(this.snapshot.degradedReason ?? null);

  readonly retrying = signal(false);
  readonly status = this.statusSignal.asReadonly();
  readonly health = this.healthSignal.asReadonly();
  readonly degraded = computed(() => this.isDesktopStore && (this.degradedReason() !== null || (this.statusSignal() !== null && this.statusSignal() !== 'ready')));

  constructor() {
    const store = this.bridge.get()?.store;
    if (!store) return;
    const apply = (health: StoreHealth): void => {
      this.healthSignal.set(health);
      this.statusSignal.set(health.status);
    };
    const unsubscribe = store.onHealth(apply);
    inject(DestroyRef).onDestroy(unsubscribe);
    void Promise.resolve(store.status()).then(apply, () => {});
  }

  /** Asks main to restart the store service. Health pushes and the returned health update the banner; a boot-time degradedReason stays until the next launch. */
  async retry(): Promise<void> {
    const store = this.bridge.get()?.store;
    if (!store || this.retrying()) return;
    this.retrying.set(true);
    try {
      const health = await store.retry();
      this.healthSignal.set(health);
      this.statusSignal.set(health.status);
      if (health.status === 'ready') this.degradedReason.set(null);
    } catch {
      /* the banner stays; the user can retry again */
    } finally {
      this.retrying.set(false);
    }
  }

  private initialStatus(): StoreStatus | null {
    if (!this.isDesktopStore) return null;
    return this.snapshot.boot?.status ?? 'unavailable';
  }
}
