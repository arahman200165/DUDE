import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'duration-formatter';
export const binding: MobileToolBinding = { load: () => import('./duration-formatter-screen') };
