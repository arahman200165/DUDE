import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'contrast-checker';
export const binding: MobileToolBinding = { load: () => import('./contrast-checker-screen') };
