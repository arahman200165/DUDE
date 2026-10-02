import { hostFetch } from "@dude/crypto/host";
import { MarkdownLink, isCheckableUrl } from "./markdown-link-extract.js";

export type LinkCheckStatus = 'skipped' | 'ok' | 'broken' | 'unverifiable';

export interface LinkCheckOutcome {
  readonly link: MarkdownLink;
  readonly status: LinkCheckStatus;
  readonly detail: string;
}

/**
 * Checks one URL's liveness via a HEAD request (falling back to GET, since
 * some servers reject HEAD). Only ever called from an explicit manual
 * "Check links" action, never automatically -- see docs/SECURITY.md's
 * network-exceptions list. A `fetch` rejection against an arbitrary
 * third-party origin (no CORS headers, DNS failure, offline, ...) is
 * indistinguishable from every other network failure in the browser's
 * Fetch API, so it's reported as "unverifiable" rather than "broken" --
 * this tool cannot tell a dead link from a CORS-blocked live one.
 */
async function checkOne(link: MarkdownLink): Promise<LinkCheckOutcome> {
  if (!isCheckableUrl(link.url)) {
    return { link, status: 'skipped', detail: 'Not an http(s) URL — not checked.' };
  }

  try {
    const response = await hostFetch(link.url, { method: 'HEAD', mode: 'cors' });
    if (response.ok) return { link, status: 'ok', detail: `${response.status} ${response.statusText}`.trim() };

    // Some servers don't support HEAD (405) -- retry with GET before concluding it's actually broken.
    if (response.status === 405) {
      const getResponse = await hostFetch(link.url, { method: 'GET', mode: 'cors' });
      return getResponse.ok
        ? { link, status: 'ok', detail: `${getResponse.status} ${getResponse.statusText}`.trim() }
        : { link, status: 'broken', detail: `${getResponse.status} ${getResponse.statusText}`.trim() };
    }

    return { link, status: 'broken', detail: `${response.status} ${response.statusText}`.trim() };
  } catch {
    return { link, status: 'unverifiable', detail: "Couldn't check (CORS or network error)." };
  }
}

/** Checks every link concurrently. `concurrency` bounds how many requests are in flight at once so a document with many links doesn't fire them all simultaneously. */
export async function checkLinks(links: readonly MarkdownLink[], concurrency = 6): Promise<readonly LinkCheckOutcome[]> {
  const results: LinkCheckOutcome[] = new Array(links.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < links.length) {
      const i = next++;
      results[i] = await checkOne(links[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, links.length) }, worker));
  return results;
}
