import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'user-agent';
export const binding: MobileToolBinding = {
  load: () => import('./user-agent-screen'),
};
