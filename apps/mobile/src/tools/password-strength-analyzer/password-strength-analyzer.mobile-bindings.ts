import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'password-strength-analyzer';
export const binding: MobileToolBinding = { load: () => import('./password-strength-analyzer-screen') };
