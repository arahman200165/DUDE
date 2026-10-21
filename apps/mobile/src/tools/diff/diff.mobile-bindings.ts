import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'diff';
export const binding: MobileToolBinding = { load: () => import('./diff-screen') };
