import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'cron';
export const binding: MobileToolBinding = { load: () => import('./cron-screen') };
