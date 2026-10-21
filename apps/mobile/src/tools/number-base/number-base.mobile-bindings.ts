import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'number-base';
export const binding: MobileToolBinding = {
  load: () => import('./number-base-screen'),
};
