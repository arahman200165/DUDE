/**
 * Presence activity, schema-free (PD-108). Kept apart from `presence.schema.ts` so a renderer can import it as
 * `@dude/contracts/hub/presence-activity` without pulling the TypeBox schema runtime into an eager bundle.
 */

/** Shell destinations a device may report as its activity; everything else is a registry tool id (validated by the Hub). */
export const PRESENCE_DESTINATIONS = ['home', 'tools', 'smart-paste', 'workspace', 'history', 'quick-run', 'projects', 'insights', 'pipelines', 'settings'] as const;
export type PresenceDestination = (typeof PRESENCE_DESTINATIONS)[number];

/** The same shape as `PresenceActivity` in `presence.schema.ts`, written out so this file needs no schema import. */
export type PresenceActivityValue = { readonly kind: 'tool'; readonly id: string } | { readonly kind: 'destination'; readonly id: PresenceDestination };

const DESTINATIONS: ReadonlySet<string> = new Set(PRESENCE_DESTINATIONS);

/**
 * What a router URL shows, as the presence contract describes it: a registered tool (`toolIdForRoute` resolves the URL through
 * the registry, so no tool id is known here), the Home deck for the empty path, or the first path segment when it is a shell
 * destination (`/settings/...` is `settings`, `/pipelines/new` is `pipelines`). Anything else (a tool route the registry does not
 * know, `open-link`, the Hub pages, an unknown path) is null: nothing is shared.
 */
export function activityForUrl(url: string, toolIdForRoute: (url: string) => string | undefined): PresenceActivityValue | null {
  const path = url.split(/[?#]/, 1)[0] ?? '';
  const segments = path.split('/').filter((segment) => segment !== '');
  const first = segments[0];
  if (first === undefined) return { kind: 'destination', id: 'home' };
  if (first === 'tools' && segments.length > 1) {
    const id = toolIdForRoute(path);
    return id === undefined ? null : { kind: 'tool', id };
  }
  return DESTINATIONS.has(first) ? { kind: 'destination', id: first as PresenceDestination } : null;
}

export function sameActivity(a: PresenceActivityValue | null, b: PresenceActivityValue | null): boolean {
  return a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);
}
