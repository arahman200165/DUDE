import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'hmac-generator';
export const binding: MobileToolBinding = { load: () => import('./hmac-generator-screen') };
