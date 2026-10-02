/** Replacement for `hub-client-loader.ts` in the `hub` build configuration. */
export const loadHubClient = (): Promise<typeof import('@dude/api-client')> => import('@dude/api-client');
