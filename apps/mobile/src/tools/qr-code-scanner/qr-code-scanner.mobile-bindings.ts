import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'qr-code-scanner';
export const binding: MobileToolBinding = {
  load: () => import('./qr-code-scanner-screen'),
};
