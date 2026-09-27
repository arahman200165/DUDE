import { Injectable, Injector, WritableSignal, effect, inject, signal } from '@angular/core';
import { PersistencePolicy } from '../../shared/models/persistence-policy.model';
import { StorageBackend, createStorageBackend } from './storage-backend';
import {
  NAMESPACE_PREFIX,
  buildConsentKey,
  buildConsentPrefix,
  buildStorageKey,
  buildToolPrefix,
} from './persistence-keys';

@Injectable({ providedIn: 'root' })
export class PersistenceService {
  private readonly injector = inject(Injector);
  private readonly local: StorageBackend = createStorageBackend('local');
  private readonly session: StorageBackend = createStorageBackend('session');
  private readonly consentSignals = new Map<string, WritableSignal<boolean>>();

  /**
   * A signal that auto-persists on every write per `policy`. `none` never
   * touches storage; `session`/`local` always use their named backend;
   * `user-choice` behaves like `session` until the user opts in via
   * `setConsent`, after which future writes land in `local`.
   */
  signal<T>(toolId: string, key: string, policy: PersistencePolicy, initialValue: T): WritableSignal<T> {
    if (policy === 'none') {
      return signal(initialValue);
    }

    if (policy === 'secure-local') {
      throw new Error('secure-local is async-only (OS keychain) — use SecureLocalService, not PersistenceService.signal().');
    }

    const storageKey = buildStorageKey(toolId, key);

    if (policy === 'user-choice') {
      const consent = this.getConsentSignal(toolId, key);
      const value = signal(this.readValue(consent() ? this.local : this.session, storageKey, initialValue));
      effect(
        () => {
          const backend = consent() ? this.local : this.session;
          backend.set(storageKey, JSON.stringify(value()));
        },
        { injector: this.injector },
      );
      return value;
    }

    const backend = policy === 'local' ? this.local : this.session;
    const value = signal(this.readValue(backend, storageKey, initialValue));
    effect(() => backend.set(storageKey, JSON.stringify(value())), { injector: this.injector });
    return value;
  }

  hasConsent(toolId: string, key: string): boolean {
    return this.getConsentSignal(toolId, key)();
  }

  setConsent(toolId: string, key: string, granted: boolean): void {
    this.getConsentSignal(toolId, key).set(granted);
    this.local.set(buildConsentKey(toolId, key), JSON.stringify(granted));

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
    const copied = this.local.get(targetKey) === null && this.local.set(targetKey, raw);
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
