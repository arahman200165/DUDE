/** Keep document navigations on the renderer's exact origin, including its dev-server port. */
export function isAllowedRendererNavigation(target: string, baseUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const next = new URL(target);
    return (next.protocol === 'http:' || next.protocol === 'https:') && next.origin === base.origin;
  } catch {
    return false;
  }
}
