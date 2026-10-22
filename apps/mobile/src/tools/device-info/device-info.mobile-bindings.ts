import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'device-info';
export const binding: MobileToolBinding = {
  load: () => import('./device-info-screen'),
};
