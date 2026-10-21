import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'whitespace-cleaner';
export const binding: MobileToolBinding = { load: () => import('./whitespace-cleaner-screen') };
