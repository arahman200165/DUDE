import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'color-converter';
export const binding: MobileToolBinding = { load: () => import('./color-converter-screen') };
