import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'barcode-generator';
export const binding: MobileToolBinding = { load: () => import('./barcode-generator-screen') };
