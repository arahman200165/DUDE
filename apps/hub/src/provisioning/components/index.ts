import { registerProvisioningComponent } from '../registry.js';
import { blobStoreComponent } from './blob-store.js';
import { cacheComponent } from './cache.js';
import { contentStoreComponent } from './content-store.js';
import { ftsComponent, vectorComponent } from './fts-vector.js';
import { queueComponent, workersComponent } from './queue-workers.js';
import { oidcComponent } from './oidc.js';
import { secretsComponent } from './secrets.js';
import { tunnelComponent } from './tunnel.js';

/**
 * The built-in components (Milestone 835; `tunnel` joined at Milestone 837). A later milestone adds its component (`tunnel`, `oidc`, `power`, `backup`) by exporting
 * a `ProvisioningComponent` from its own module and adding one line here; the engine, the admin methods, the route and the CLI
 * never change. A component that is not built yet is simply absent.
 */
const BUILT_IN = [contentStoreComponent, ftsComponent, vectorComponent, blobStoreComponent, cacheComponent, queueComponent, workersComponent, secretsComponent, tunnelComponent, oidcComponent] as const;
for (const component of BUILT_IN) registerProvisioningComponent(component);
