/**
 * Build-time host flag. The `hub` angular.json configuration swaps this file for `host-flag.hub.ts`
 * (fileReplacements), so the web app served by the Hub knows what it is without sniffing the URL.
 * Desktop is still detected at runtime through the preload bridge.
 */
export const BUILD_HOST: 'web' | 'hub' = 'web';
