import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'regex';
export const binding: MobileToolBinding = { load: () => import('./regex-screen') };
