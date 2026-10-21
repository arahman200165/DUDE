import type { DataScope } from '@dude/domain';
import type { PersistencePolicy } from '@dude/shared-types/shared/models/persistence-policy.model';
import { createManifestScopeLookup, resolveKvScope } from '@dude/persistence/settings/kv-scope';
import { ToolInputStore } from '../tools-host/tool-input-store';

/** Reserved sub-key of a tool's in-memory input that holds its non-persisted preferences. */
export const PREFS_KEY = '__prefs';

/** The slice of a tool manifest that decides how a preference key is stored. */
export interface PreferenceToolInfo {
  readonly id: string;
  readonly persistence?: { readonly preferences?: PersistencePolicy };
  readonly settingScopes?: Readonly<Record<string, { readonly scope: DataScope }>>;
}

export type PreferenceStorage = 'synced-kv' | 'memory';
export interface PreferenceResolution {
  readonly policy: PersistencePolicy;
  readonly scope: DataScope;
  /**
   * `synced-kv`: the active context's settings KV under the web namespace/key (rides the `settings` sync category).
   * `memory`: ToolInputStore only. Covers `local-only` (session, user-choice, none), `device` (secure-local) and
   * unknown tools: those are never written to the mobile KV.
   */
  readonly storage: PreferenceStorage;
}

/**
 * Same rule the web PersistenceService applies (`resolveKvScope`): a core definition, then manifest `settingScopes`,
 * then the policy. Only a `local` preference that resolves to `environment` scope is durable and syncable on mobile.
 */
export function resolveToolPreference(toolId: string, key: string, tools: readonly PreferenceToolInfo[]): PreferenceResolution {
  const tool = tools.find(candidate => candidate.id === toolId);
  const policy: PersistencePolicy = tool?.persistence?.preferences ?? 'session';
  const scope = resolveKvScope(toolId, key, policy, createManifestScopeLookup(tools));
  return { policy, scope, storage: tool && policy === 'local' && scope === 'environment' ? 'synced-kv' : 'memory' };
}

/** Settings KV of the active storage context. Writes enqueue the `settings` sync op exactly like other setting writes. */
export interface ToolSettingsPort {
  get(namespace: string, key: string): Promise<unknown>;
  set(namespace: string, key: string, value: unknown, meta: { readonly policy: 'local'; readonly scope: 'environment' }): Promise<void>;
}

const idOf = (toolId: string, key: string): string => `${toolId}\u0000${key}`;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Preference values for every tool. The wire key is `(namespace = toolId, key)` with the bare JSON value, the same
 * entity the web app journals as `setting` `<toolId>:<key>`, so values converge across devices.
 */
export class ToolPreferenceStore {
  private port: ToolSettingsPort | null = null;
  private contextKey: string | undefined;
  private generation = 0;
  private readonly cache = new Map<string, unknown>();
  private readonly requested = new Map<string, { toolId: string; key: string }>();
  private readonly hydrated = new Set<string>();
  private readonly dirty = new Set<string>();
  private pendingWrites = 0;
  private writes: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeMemory: () => void;

  constructor(private readonly memory: ToolInputStore, private readonly tools: readonly PreferenceToolInfo[]) {
    this.unsubscribeMemory = memory.subscribe(() => this.emit());
  }

  resolve(toolId: string, key: string): PreferenceResolution { return resolveToolPreference(toolId, key, this.tools); }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  dispose(): void { this.unsubscribeMemory(); this.listeners.clear(); }

  /** Stored raw value, or undefined when nothing is stored. Stable reference until the value changes. */
  read(toolId: string, key: string): unknown {
    if (this.resolve(toolId, key).storage === 'synced-kv') return this.cache.get(idOf(toolId, key));
    const prefs = this.memory.get(toolId)[PREFS_KEY];
    return isRecord(prefs) ? prefs[key] : undefined;
  }

  write(toolId: string, key: string, value: unknown): void {
    const resolution = this.resolve(toolId, key);
    if (resolution.storage === 'memory') {
      const prefs = this.memory.get(toolId)[PREFS_KEY];
      this.memory.set(toolId, { [PREFS_KEY]: { ...(isRecord(prefs) ? prefs : {}), [key]: value } });
      return;
    }
    const id = idOf(toolId, key);
    this.requested.set(id, { toolId, key });
    this.dirty.add(id);
    this.cache.set(id, value);
    this.emit();
    const port = this.port;
    if (!port) return;
    this.pendingWrites++;
    this.writes = this.writes
      .then(() => port.set(toolId, key, value, { policy: 'local', scope: 'environment' }))
      .catch(() => undefined) // the in-memory value stays; the next write retries the persisted copy
      .finally(() => { this.pendingWrites--; });
  }

  /** Loads the stored value once per bound context. A local write made while loading wins. */
  async hydrate(toolId: string, key: string): Promise<void> {
    if (this.resolve(toolId, key).storage !== 'synced-kv') return;
    const id = idOf(toolId, key);
    this.requested.set(id, { toolId, key });
    const port = this.port;
    if (!port || this.hydrated.has(id)) return;
    this.hydrated.add(id);
    await this.load(port, this.generation, toolId, key);
  }

  /** Attaches (or re-attaches after a context change) the settings KV. Cached values belong to the previous context. */
  bind(port: ToolSettingsPort | null, contextKey?: string): void {
    if (port === this.port && contextKey === this.contextKey) return;
    this.port = port;
    this.contextKey = contextKey;
    this.generation++;
    this.hydrated.clear();
    this.dirty.clear();
    if (this.cache.size) { this.cache.clear(); this.emit(); }
    if (port) for (const { toolId, key } of this.requested.values()) void this.hydrate(toolId, key);
  }

  /** Re-reads requested keys, e.g. after a sync pull delivered another device's values. Skipped while writes are pending. */
  async refresh(): Promise<void> {
    const port = this.port;
    if (!port || this.pendingWrites > 0) return;
    const generation = this.generation;
    await Promise.all([...this.requested.values()].map(({ toolId, key }) => this.load(port, generation, toolId, key, true)));
  }

  /** Resolves when queued writes have finished (tests, shutdown). */
  flush(): Promise<void> { return this.writes; }

  private async load(port: ToolSettingsPort, generation: number, toolId: string, key: string, force = false): Promise<void> {
    const id = idOf(toolId, key);
    let value: unknown;
    try { value = await port.get(toolId, key); } catch { return; }
    if (generation !== this.generation || value === undefined || (!force && this.dirty.has(id)) || this.pendingWrites > 0) return;
    if (JSON.stringify(this.cache.get(id)) === JSON.stringify(value)) return;
    this.cache.set(id, value);
    this.emit();
  }
  private emit(): void { for (const listener of [...this.listeners]) listener(); }
}

/** Accepts a stored value only when it has the default's JSON shape; anything else falls back to the default. */
export function defaultPreferenceDecode<T>(defaultValue: T): (raw: unknown) => T | null {
  const kind = (value: unknown): string => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const expected = kind(defaultValue);
  return raw => kind(raw) === expected ? raw as T : null;
}
