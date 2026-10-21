import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'xml-formatter';
export const binding: MobileToolBinding = { load: () => import('./xml-formatter-screen') };
