/**
 * Loads the shared Hub client. Only the Hub-served web build (`hub` configuration) swaps this file for
 * `hub-client-loader.hub.ts` (fileReplacements), so the Pages and desktop bundles carry neither the client nor its
 * schema validator.
 */
export const loadHubClient = (): Promise<typeof import('@dude/api-client')> => Promise.reject(new Error('The Hub client is not part of this build.'));
