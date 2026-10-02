import { InjectionToken, type Provider } from '@angular/core';
import type { DeviceStoreBoot } from '@dude/contracts';
import type { PlatformBridge } from '@dude/contracts/shared/models/platform-bridge.model';

/**
 * What `main.ts` learned from the Device Store before bootstrap. On web `boot` is null and there is no
 * `degradedReason`; on desktop a `degradedReason` means `local` state is memory-only for this launch.
 */
export interface BootSnapshot {
  readonly boot: DeviceStoreBoot | null;
  readonly degradedReason?: string;
}

export const BOOT_SNAPSHOT = new InjectionToken<BootSnapshot>('DUDE device store boot snapshot', {
  providedIn: 'root',
  factory: () => ({ boot: null }),
});

export function provideBootSnapshot(snapshot: BootSnapshot): Provider {
  return { provide: BOOT_SNAPSHOT, useValue: snapshot };
}

export async function loadBootSnapshot(bridge: Pick<PlatformBridge, 'store'> | undefined, timeoutMs = 3000): Promise<BootSnapshot> {
  if (!bridge?.store) return { boot: null };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
  try {
    const result = await Promise.race([bridge.store.hydrate(), timeout]);
    if (result === 'timeout') return { boot: null, degradedReason: 'hydrate-timeout' };
    if (result.status !== 'ready') return { boot: result, degradedReason: `store-${result.status}` };
    return { boot: result };
  } catch (error) {
    return { boot: null, degradedReason: error instanceof Error ? `hydrate-failed: ${error.message}` : 'hydrate-failed' };
  } finally {
    clearTimeout(timer);
  }
}
