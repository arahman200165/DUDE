import { MarkdownLink } from "./markdown-link-extract.js";
import { checkLinks } from "./markdown-link-check.js";

function link(url: string, line = 1): MarkdownLink {
  return { line, text: url, url };
}

describe('checkLinks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports "ok" for a successful HEAD response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }),
    );
    const [result] = await checkLinks([link('https://example.com')]);
    expect(result.status).toBe('ok');
  });

  it('reports "broken" for a 404 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }),
    );
    const [result] = await checkLinks([link('https://example.com/missing')]);
    expect(result.status).toBe('broken');
    expect(result.detail).toContain('404');
  });

  it('retries with GET when HEAD returns 405, and reports "ok" if that succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 405, statusText: 'Method Not Allowed' })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK' });
    vi.stubGlobal('fetch', fetchMock);

    const [result] = await checkLinks([link('https://example.com')]);
    expect(result.status).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports "unverifiable" when fetch throws (CORS/network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const [result] = await checkLinks([link('https://example.com')]);
    expect(result.status).toBe('unverifiable');
    expect(result.detail).toContain("Couldn't check");
  });

  it('reports "skipped" for a non-http(s) URL without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const [result] = await checkLinks([link('#anchor')]);
    expect(result.status).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks every link and preserves result order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }),
    );
    const links = [link('https://a.com', 1), link('https://b.com', 2), link('https://c.com', 3)];
    const results = await checkLinks(links, 2);
    expect(results.map((r) => r.link.url)).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
  });
});
