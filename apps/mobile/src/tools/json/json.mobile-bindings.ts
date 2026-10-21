import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'json';
export const binding: MobileToolBinding = { load: () => import('./json-screen') };
