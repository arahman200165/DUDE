import type { DataScope, DataSensitivity } from '@dude/domain';

/** kv = key/value row, device-doc = desktop document, secret = SecretRef-backed value. */
export type SettingStorage = 'kv' | 'device-doc' | 'secret';

export interface SettingDefinition<T = unknown> {
  /** '<namespace>:<name>' */
  readonly key: string;
  readonly namespace: string;
  readonly name: string;
  readonly scope: DataScope;
  readonly sensitivity: DataSensitivity;
  readonly defaultValue: T;
  readonly storage: SettingStorage;
  /** Whether changes write an outbox op (journaled entity). */
  readonly journal: boolean;
  /** Owning module, e.g. 'core' or 'settings.ai'. */
  readonly owner: string;
  readonly description?: string;
}
