import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'qr-code-generator';
export const binding: MobileToolBinding = { load: () => import('./qr-code-generator-screen') };
