import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'unicode-normalization';
export const binding: MobileToolBinding = { load: () => import('./unicode-normalization-screen') };
