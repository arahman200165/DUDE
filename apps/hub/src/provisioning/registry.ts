import { HUB_PROVISIONING_COMPONENT_IDS } from '@dude/contracts/hub';
import type { ProvisioningComponent } from './types.js';

const registered = new Map<string, ProvisioningComponent>();

/**
 * The extension point. A later milestone adds its component (`tunnel`, `oidc`, `power`, `backup`) by calling this once from its own
 * module (and listing that module in `components/index.ts`); the engine never changes. The id must be one of the closed
 * `HUB_PROVISIONING_COMPONENT_IDS`, and one id has one component. Returns a function that removes it again (specs).
 */
export function registerProvisioningComponent(component: ProvisioningComponent): () => void {
  if (!(HUB_PROVISIONING_COMPONENT_IDS as readonly string[]).includes(component.id)) throw new Error(`Unknown provisioning component "${component.id}".`);
  if (registered.has(component.id)) throw new Error(`The provisioning component "${component.id}" is already registered.`);
  registered.set(component.id, component);
  return () => { if (registered.get(component.id) === component) registered.delete(component.id); };
}

/** The registered components in the contract's display order. */
export function listProvisioningComponents(): ProvisioningComponent[] {
  return HUB_PROVISIONING_COMPONENT_IDS.flatMap((id) => {
    const component = registered.get(id);
    return component === undefined ? [] : [component];
  });
}
