import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'yaml-json';
export const binding: MobileToolBinding = { load: () => import('./yaml-json-screen') };
