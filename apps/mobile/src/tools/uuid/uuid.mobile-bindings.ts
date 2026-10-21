import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'uuid';
export const binding: MobileToolBinding = { load: () => import('./uuid-screen') };
