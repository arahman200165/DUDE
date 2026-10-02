import { bootstrapApplication } from '@angular/platform-browser';
import { findSettingDefinition } from '@dude/persistence';
import './app/core/platform/engine-host.adapter';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { currentPlatformBridge } from './app/core/platform/platform-bridge.adapter';
import { installLocalBackend } from './app/core/persistence/local-backend-registry';
import { createDegradedMemoryBackend, createDeviceKvBackend } from './app/core/persistence/device-store/device-kv-backend';
import { loadBootSnapshot, provideBootSnapshot, type BootSnapshot } from './app/core/persistence/device-store/boot-snapshot';
import { importRendererLegacyStorage } from './app/core/persistence/device-store/renderer-legacy-import';

const LEGACY_IMPORT_TIMEOUT_MS = 3000;

/**
 * Desktop: hydrate the Device Store and install it as the `local` backend BEFORE bootstrap, so
 * AppearanceService and every PersistenceService.signal initialise from the hydrated cache. This is
 * deliberately not an app initializer: those run concurrently and would race AppearanceService.
 */
async function prepareLocalStorage(): Promise<BootSnapshot> {
  const bridge = currentPlatformBridge();
  const snapshot = await loadBootSnapshot(bridge);
  if (!bridge?.store) return snapshot;

  if (snapshot.boot?.status === 'ready' && !snapshot.degradedReason) {
    const backend = createDeviceKvBackend(snapshot.boot, bridge.store, {
      immediate: (namespace, key) => findSettingDefinition(namespace, key)?.journal === true,
    });
    installLocalBackend(backend);
    try {
      await Promise.race([
        importRendererLegacyStorage(backend),
        new Promise<void>((resolve) => setTimeout(resolve, LEGACY_IMPORT_TIMEOUT_MS)),
      ]);
    } catch (error) {
      console.warn('[DUDE] renderer legacy import failed', error);
    }
    return snapshot;
  }

  // Hydration failed or timed out: run from memory so the UI works, and tell the user changes are not saved.
  console.warn(`[DUDE] device store unavailable (${snapshot.degradedReason ?? 'unknown'}); changes will not be saved.`);
  installLocalBackend(createDegradedMemoryBackend());
  return { boot: snapshot.boot, degradedReason: snapshot.degradedReason ?? 'unavailable' };
}

async function start(): Promise<void> {
  const snapshot = await prepareLocalStorage();
  await bootstrapApplication(App, { ...appConfig, providers: [...appConfig.providers, provideBootSnapshot(snapshot)] });
}

start().catch((err) => console.error(err));
