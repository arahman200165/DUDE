/**
 * Where this copy of the app runs. `desktop` is the Electron shell, `web-standalone` the zero-install Pages/PWA
 * build and `hub-web` the build the Hub serves from its own origin (an administration entry point).
 */
export type HostKind = 'desktop' | 'web-standalone' | 'hub-web';

export function resolveHostKind(desktop: boolean, buildHost: 'web' | 'hub'): HostKind {
  if (desktop) return 'desktop';
  return buildHost === 'hub' ? 'hub-web' : 'web-standalone';
}
