import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'unix-timestamp';
export const binding: MobileToolBinding = { load: () => import('./unix-timestamp-screen') };
