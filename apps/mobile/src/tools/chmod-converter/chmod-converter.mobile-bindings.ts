import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'chmod-converter';
export const binding: MobileToolBinding = { load: () => import('./chmod-converter-screen') };
