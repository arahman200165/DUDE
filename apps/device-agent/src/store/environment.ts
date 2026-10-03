import type { Db } from '@dude/sqlite-store';
import { getMeta } from '@dude/sqlite-store';
import { getEnrollment } from './repos/hub-enrollment.repo.js';

/**
 * The environment id new records and ops carry: the Hub's while an enrollment exists (enrolled or revoked, so a revoked
 * device's stranded work keeps its environment), the store's own standalone id otherwise. `meta.environment_id` is never
 * overwritten by enrolling; the first sync re-keys existing rows to the Hub environment.
 */
export function workingEnvironmentId(db: Db): string {
  return getEnrollment(db)?.environmentId ?? getMeta(db, 'environment_id') ?? '';
}
