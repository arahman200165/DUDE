import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'json-flatten';
export const binding: MobileToolBinding = {
  load: () => import('./json-flatten-screen'),
};
