import { existsSync } from 'node:fs';
import type { ComponentOutcome, ProvisioningComponent, ProvisioningContext } from '../types.js';

const RUN = 'Run "dude-hub provision".';

/**
 * `data/savesphere.db`: the SaveSphere content store. The engine opens it (creating it on a provision run; WAL, integrity
 * quick-check, its own numbered migrations with a pre-migration copy), so this component only reports what the engine found.
 */
export const contentStoreComponent: ProvisioningComponent = {
  id: 'content-store',
  core: true,
  provision: (context: ProvisioningContext) => (context.store.state === 'ready' && context.store.createdNow ? ['content-store'] : []),
  check(context: ProvisioningContext): ComponentOutcome {
    const { store } = context;
    switch (store.state) {
      case 'ready':
        return { state: 'ready', detail: `Opens in WAL mode, the integrity check passed and the schema is at version ${store.schemaVersion}.` };
      case 'absent':
        return { state: 'not-configured', detail: 'The SaveSphere content store has not been created yet.', nextAction: RUN };
      case 'incompatible':
        return { state: 'needs-attention', detail: 'The content store was written by a newer Hub and this build will not open it.', nextAction: 'Install a DUDE Hub version that supports this database.' };
      default:
        return {
          state: 'needs-attention',
          detail: existsSync(context.paths.saveSphereDbPath) ? 'The content store could not be opened or failed its integrity check.' : 'The content store could not be created.',
          nextAction: 'Restore the Hub from a backup, or move data/savesphere.db aside and run "dude-hub provision".',
        };
    }
  },
};
