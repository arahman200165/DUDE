import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { TOOL_DEFINITIONS } from '../registry/tool-definitions';
import { PersistenceService } from './persistence.service';

/**
 * Applies every manifest-declared `storageMigrations` entry (see `ToolStorageMigration`) — pure
 * data iteration, so `core/` never names the tool or key being moved. Runs before any service
 * reads its signals, so a tool that is never opened is still migrated.
 */
export function runStorageMigrations(definitions: readonly ToolDefinition[], persistence: PersistenceService): void {
  for (const definition of definitions) {
    for (const migration of definition.storageMigrations ?? []) {
      persistence.moveLocalValue(migration.fromNamespace, migration.fromKey, definition.id, migration.toKey);
    }
  }
}

export function provideStorageMigrations(): EnvironmentProviders {
  return provideAppInitializer(() => runStorageMigrations(TOOL_DEFINITIONS, inject(PersistenceService)));
}
