import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';
import { mobileAvailability, type MobileBindingMap } from './mobile-binding';

export interface CatalogEntry { readonly tool: ToolMetadata; readonly runnable: boolean; readonly reason?: string }
export interface CatalogPartition {
  readonly entries: readonly CatalogEntry[];
  readonly runnableCount: number;
  readonly desktopOnlyCount: number;
  /** True when no tool in the list is runnable, so the full list is shown and the toggle is moot. */
  readonly forcedAll: boolean;
}

/**
 * Runnable tools first (input order is preserved, so the shared ranking holds). Desktop/web-only tools are appended
 * only when `showAll` is set or when nothing in the list is runnable.
 */
export function partitionCatalog(tools: readonly ToolMetadata[], bindings: MobileBindingMap, showAll: boolean): CatalogPartition {
  const runnable: CatalogEntry[] = [];
  const other: CatalogEntry[] = [];
  for (const tool of tools) {
    const availability = mobileAvailability(tool, bindings);
    if (availability.available) runnable.push({ tool, runnable: true });
    else other.push({ tool, runnable: false, reason: availability.reason });
  }
  const forcedAll = runnable.length === 0;
  return { entries: showAll || forcedAll ? [...runnable, ...other] : runnable, runnableCount: runnable.length, desktopOnlyCount: other.length, forcedAll };
}
