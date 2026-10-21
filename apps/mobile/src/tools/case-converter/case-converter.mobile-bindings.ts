import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'case-converter';
export const binding: MobileToolBinding = { load: () => import('./case-converter-screen') };
