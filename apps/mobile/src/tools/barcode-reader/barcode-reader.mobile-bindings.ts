import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'barcode-reader';
export const binding: MobileToolBinding = {
  load: () => import('./barcode-reader-screen'),
};
