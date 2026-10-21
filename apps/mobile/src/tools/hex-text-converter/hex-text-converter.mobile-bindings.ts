import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'hex-text-converter';
export const binding: MobileToolBinding = {
  load: () => import('./hex-text-converter-screen'),
};
