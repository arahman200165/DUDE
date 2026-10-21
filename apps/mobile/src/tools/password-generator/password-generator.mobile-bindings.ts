import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'password-generator';
export const binding: MobileToolBinding = { load: () => import('./password-generator-screen') };
