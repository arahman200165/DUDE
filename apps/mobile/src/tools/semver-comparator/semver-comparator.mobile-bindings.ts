import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'semver-comparator';
export const binding: MobileToolBinding = { load: () => import('./semver-comparator-screen') };
