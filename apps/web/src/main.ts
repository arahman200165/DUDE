import { bootstrapApplication } from '@angular/platform-browser';
import { findSettingDefinition } from '@dude/persistence';
import './app/core/platform/engine-host.adapter';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { BUILD_HOST } from './app/core/platform/host-flag';
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

/**
 * Hub-served web only (`hub` build, no desktop bridge): attach to the Hub and install the Hub-backed `local` backend before
 * bootstrap. A dynamic import, so the Pages and desktop bundles never load any of it (nor the Hub client).
 */
async function prepareHubWeb() {
  if (BUILD_HOST !== 'hub' || currentPlatformBridge()) return null;
  const [{ bootHubWeb }, runtime] = await Promise.all([import('./app/core/hub-web/hub-web-boot'), import('./app/core/hub-web/hub-web-runtime')]);
  return { result: await bootHubWeb(), runtime };
}

async function start(): Promise<void> {
  const hub = await prepareHubWeb();
  if (hub?.result.mode === 'blocked') {
    // The Hub is transferred or older than this browser's record (PD-071): show only the notice, never the app.
    await hub.runtime.showAuthorityGate(hub.result);
    return;
  }
  const snapshot = await prepareLocalStorage();
  const providers = [...appConfig.providers, provideBootSnapshot(snapshot), ...(hub ? hub.runtime.hubWebProviders(hub.result) : [])];
  const appRef = await bootstrapApplication(App, { ...appConfig, providers });
  if (hub) hub.runtime.startHubWebRuntime(appRef, hub.result);
}

start().catch((err) => console.error(err));
