import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'http-status';
export const binding: MobileToolBinding = {
  load: () => import('./http-status-screen'),
};
