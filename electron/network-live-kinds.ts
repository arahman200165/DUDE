import { registerLiveKind } from './network-live';
import { inspectDnssec } from './network-dnssec';

/**
 * Registers every Phase 28 live check with the dispatcher (`network-live.ts`). Imported for its
 * side effect by `network-runner.ts`, so the bridge and runner stay free of per-tool branches.
 */
registerLiveKind('dnssec-inspector', (request, signal, progress) => inspectDnssec(request, signal, progress));
