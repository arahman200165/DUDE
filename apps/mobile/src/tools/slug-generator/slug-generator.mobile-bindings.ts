import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'slug-generator';
export const binding: MobileToolBinding = { load: () => import('./slug-generator-screen') };
