import type { MobileToolBinding } from '../../registry/mobile-binding';

export const bindingId = 'text-inspector';
export const binding: MobileToolBinding = { load: () => import('./text-inspector-screen') };
