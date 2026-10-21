import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'url-encode';
export const binding: MobileToolBinding = {
  load: () => import('./url-encode-screen'),
};
