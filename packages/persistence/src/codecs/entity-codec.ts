import type { DataScope, DataSensitivity } from '@dude/domain';

/**
 * Row codec for one entity type, used for hydration and import.
 * `decode` returns null for unrecoverable garbage and never throws.
 */
export interface EntityCodec<T, Ctx = void> {
  readonly entityType: string;
  readonly schemaVersion: number;
  readonly scope: DataScope;
  readonly sensitivity: DataSensitivity;
  /** Whether commits write an outbox op. */
  readonly journaled: boolean;
  idOf(value: T): string;
  decode(raw: unknown, ctx: Ctx): T | null;
  encode(value: T): unknown;
}
