import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'timezone-offset-comparator';
export const binding: MobileToolBinding = { load: () => import('./timezone-offset-comparator-screen') };
