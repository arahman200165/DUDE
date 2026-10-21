import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'jwt';
export const binding: MobileToolBinding = {
  load: () => import('./jwt-screen'),
};
