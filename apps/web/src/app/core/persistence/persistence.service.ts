import { Injectable, Injector, Signal, WritableSignal, effect, inject, signal } from '@angular/core';
import { PersistencePolicy } from "@dude/shared-types/shared/models/persistence-policy.model";
import { StorageBackend, StorageWriteMeta, createStorageBackend } from './storage-backend';
import { createManifestScopeLookup, resolveKvScope } from '@dude/persistence';
import { TOOL_METADATA } from '@dude/tool-registry';
import { DEVICE_NAMESPACE } from '../device/device-identity.service';
import {
  NAMESPACE_PREFIX,
  buildConsentKey,
  buildConsentPrefix,
  buildStorageKey,
  buildToolPrefix,
} from "@dude/tool-engine/core/persistence/persistence-keys";

/**
 * Multi-tab coherence for a `local` signal (DUDE_PRD.md §21 Phase 26 Item 14). Another open DUDE
 * tab writing the same key fires a `storage` event here:
 * - `'live'`: adopt the other tab's value (app-level stores: pipelines, scripts, projects,
 *   templates). Without it, the last tab to save silently erases the other's additions.
 * - `'notify'`: leave this tab's value alone but bump `externalChanges(...)`, for state each tab
 *   owns (the workspace layout), where the UI offers "reload / keep mine" instead.
 * Omitted means today's behaviour: independent per tab.
 */
export type CrossTabSync = 'live' | 'notify';

/** Manifest `settingScopes` overrides, indexed once from the generated registry so core never names a tool. */
const MANIFEST_SCOPES = createManifestScopeLookup(TOOL_METADATA);

@Injectable({ providedIn: 'root' })
export class PersistenceService {
  private readonly injector = inject(Injector);
  private readonly local: StorageBackend = createStorageBackend('local');
  private readonly session: StorageBackend = createStorageBackend('session');
  private readonly consentSignals = new Map<string, WritableSignal<boolean>>();
  // Only root-level stores opt in, so holding their signals for the app's lifetime is intended.
  private readonly liveSignals = new Map<string, Set<WritableSignal<unknown>>>();
  private readonly externalChangeCounters = new Map<string, WritableSignal<number>>();

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (event) => {
      if (!event.key || (typeof localStorage !== 'undefined' && event.storageArea !== localStorage)) return;
      this.externalChangeCounters.get(event.key)?.update((count) => count + 1);
      const live = this.liveSignals.get(event.key);
      if (!live || event.newValue === null) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.newValue);
      } catch {
        return;
      }
      for (const value of live) value.set(parsed);
    });
  }

  /** Increments whenever another tab writes this `local` key. Pair with `crossTab: 'notify'`. */
  externalChanges(toolId: string, key: string): Signal<number> {
    return this.counterFor(buildStorageKey(toolId, key)).asReadonly();
  }

  /**
   * A signal that auto-persists on every write per `policy`. `none` never
   * touches storage; `session`/`local` always use their named backend;
   * `user-choice` behaves like `session` until the user opts in via
   * `setConsent`, after which future writes land in `local`.
   */
  signal<T>(toolId: string, key: string, policy: PersistencePolicy, initialValue: T, options?: { readonly crossTab?: CrossTabSync }): WritableSignal<T> {
    if (policy === 'none') {
      return signal(initialValue);
    }

    if (policy === 'secure-local') {
      throw new Error('secure-local is async-only (OS keychain) — use SecretsService, not PersistenceService.signal().');
    }

    const storageKey = buildStorageKey(toolId, key);

    const meta: StorageWriteMeta = { policy, scope: resolveKvScope(toolId, key, policy, MANIFEST_SCOPES) };

    if (policy === 'user-choice') {
      const consent = this.getConsentSignal(toolId, key);
      const value = signal(this.readValue(consent() ? this.local : this.session, storageKey, initialValue));
      effect(
        () => {
          const backend = consent() ? this.local : this.session;
          backend.set(storageKey, JSON.stringify(value()), meta);
        },
        { injector: this.injector },
      );
      return value;
    }

    const backend = policy === 'local' ? this.local : this.session;
    const value = signal(this.readValue(backend, storageKey, initialValue));
    effect(
      () => {
        const json = JSON.stringify(value());
        // Skipping an identical write keeps a value adopted from another tab from echoing back.
        if (backend.get(storageKey) !== json) backend.set(storageKey, json, meta);
      },
      { injector: this.injector },
    );
    if (policy === 'local' && options?.crossTab === 'live') {
      let set = this.liveSignals.get(storageKey);
      if (!set) this.liveSignals.set(storageKey, (set = new Set()));
      set.add(value as WritableSignal<unknown>);
    }
    if (policy === 'local' && options?.crossTab === 'notify') this.counterFor(storageKey);
    return value;
  }

  private counterFor(storageKey: string): WritableSignal<number> {
    let counter = this.externalChangeCounters.get(storageKey);
    if (!counter) this.externalChangeCounters.set(storageKey, (counter = signal(0)));
    return counter;
  }

  hasConsent(toolId: string, key: string): boolean {
    return this.getConsentSignal(toolId, key)();
  }

  setConsent(toolId: string, key: string, granted: boolean): void {
    this.getConsentSignal(toolId, key).set(granted);
    this.local.set(buildConsentKey(toolId, key), JSON.stringify(granted), { policy: 'local', scope: 'device' });

    if (!granted) {
      this.local.remove(buildStorageKey(toolId, key));
    }
  }

  /**
   * One-time move of a `local` value from one namespace/key to another: copies only when the
   * target is empty (a value already written under the new key always wins), then removes the
   * source either way. Returns whether a value was copied. Idempotent.
   */
  moveLocalValue(fromToolId: string, fromKey: string, toToolId: string, toKey: string): boolean {
    const sourceKey = buildStorageKey(fromToolId, fromKey);
    const raw = this.local.get(sourceKey);
    if (raw === null) return false;

    const targetKey = buildStorageKey(toToolId, toKey);
    const copied = this.local.get(targetKey) === null && this.local.set(targetKey, raw, { policy: 'local', scope: resolveKvScope(toToolId, toKey, 'local', MANIFEST_SCOPES) });
    this.local.remove(sourceKey);
    return copied;
  }

  clearTool(toolId: string): void {
    for (const backend of [this.local, this.session]) {
      for (const storedKey of backend.keys(buildToolPrefix(toolId))) {
        backend.remove(storedKey);
      }
    }
    for (const consentKey of this.local.keys(buildConsentPrefix(toolId))) {
      this.local.remove(consentKey);
    }
  }

  clearAll(): void {
    for (const backend of [this.local, this.session]) {
      for (const storedKey of backend.keys(NAMESPACE_PREFIX)) {
        // The web installation record is the device's identity, not user data.
        if (storedKey.startsWith(`${NAMESPACE_PREFIX}:${DEVICE_NAMESPACE}:`)) continue;
        backend.remove(storedKey);
      }
    }
  }

  private getConsentSignal(toolId: string, key: string): WritableSignal<boolean> {
    const consentKey = buildConsentKey(toolId, key);
    let consentSignal = this.consentSignals.get(consentKey);

    if (!consentSignal) {
      consentSignal = signal(this.local.get(consentKey) === 'true');
      this.consentSignals.set(consentKey, consentSignal);
    }

    return consentSignal;
  }

  private readValue<T>(backend: StorageBackend, storageKey: string, initialValue: T): T {
    const raw = backend.get(storageKey);
    if (raw === null) return initialValue;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  }
}
