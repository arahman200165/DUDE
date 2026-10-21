import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'url-inspector';
export const binding: MobileToolBinding = {
  load: () => import('./url-inspector-screen'),
};
