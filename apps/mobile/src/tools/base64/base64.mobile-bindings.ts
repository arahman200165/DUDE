import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'base64';
export const binding: MobileToolBinding = {
  load: () => import('./base64-screen'),
};
