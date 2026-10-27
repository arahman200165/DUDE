import type { SqliteVecState } from '../../db/sqlite-vec.js';
import type { ComponentOutcome, ProvisioningComponent, ProvisioningContext } from '../types.js';

/**
 * Full-text search: FTS5 with the porter tokenizer, proved in a throwaway in-memory database (the Milestone 830 probe shared with
 * `dude-hub self-test`). The search tables themselves arrive with the content phases that fill them; nothing is created here.
 */
export const ftsComponent: ProvisioningComponent = {
  id: 'fts',
  async check(context: ProvisioningContext): Promise<ComponentOutcome> {
    try {
      await context.probes.fts5();
      return { state: 'ready', detail: 'Full-text search (FTS5 with the porter tokenizer) works.' };
    } catch {
      return { state: 'degraded', detail: 'This SQLite build has no FTS5, so full-text search is unavailable.', nextAction: 'Update the Hub to a build that bundles Node 24 with FTS5.' };
    }
  },
};

/** The probe's reason carries a path; the report only ever gets a fixed sentence per cause. */
function vectorUnavailable(reason: string, platform: NodeJS.Platform): ComponentOutcome {
  if (platform !== 'win32' || /^no pinned sqlite-vec library/.test(reason)) {
    return { state: 'unavailable', detail: 'Vector search is not available in this deployment (no pinned sqlite-vec library for this platform, for example Docker). Full-text search is unaffected.' };
  }
  if (/^vec0\.dll not found/.test(reason)) {
    return { state: 'unavailable', detail: 'Vector search is unavailable: the pinned vec0.dll library was not found beside the Hub.', nextAction: 'Reinstall or update the Hub so vec0.dll is staged beside it.' };
  }
  if (/hash mismatch/.test(reason)) {
    return { state: 'unavailable', detail: 'Vector search is unavailable: vec0.dll did not match its pinned hash and was not loaded.', nextAction: 'Reinstall or update the Hub.' };
  }
  return { state: 'unavailable', detail: 'Vector search is unavailable: the pinned vec0.dll library could not be loaded.', nextAction: 'Reinstall or update the Hub.' };
}

/**
 * Vector search: the hash-verified `sqlite-vec` library loaded into a throwaway in-memory database. `unavailable` is a normal,
 * allowed answer (Docker has no build), never an error, and never lowers the overall status. No `vec0` table is created yet: the
 * index is filled by SS5, and a table that needs the extension at every open is that milestone's decision.
 */
export const vectorComponent: ProvisioningComponent = {
  id: 'vector',
  check(context: ProvisioningContext): ComponentOutcome {
    let state: SqliteVecState;
    try {
      state = context.probes.sqliteVec();
    } catch {
      return vectorUnavailable('probe failed', context.platform);
    }
    return state.available
      ? { state: 'ready', detail: `Vector search is available (sqlite-vec ${state.version}, hash-verified).` }
      : vectorUnavailable(state.reason, context.platform);
  },
};
