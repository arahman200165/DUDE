import type { MobileToolBinding } from '../../registry/mobile-binding';
export const bindingId = 'csv-viewer';
export const binding: MobileToolBinding = { load: () => import('./csv-viewer-screen') };
