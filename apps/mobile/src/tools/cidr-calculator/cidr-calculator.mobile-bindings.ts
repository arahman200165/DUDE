import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'cidr-calculator';
export const binding: MobileToolBinding = { load: () => import('./cidr-calculator-screen') };
