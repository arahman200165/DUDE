import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'cookie-tools';
export const binding: MobileToolBinding = {
  load: () => import('./cookie-tools-screen'),
};
