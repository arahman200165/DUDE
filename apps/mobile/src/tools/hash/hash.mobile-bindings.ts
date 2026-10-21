import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'hash';
export const binding: MobileToolBinding = { load: () => import('./hash-screen') };
