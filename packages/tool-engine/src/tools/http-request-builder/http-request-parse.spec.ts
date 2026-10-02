import { parseHttpRequestText } from "./http-request-parse.js";

describe('parseHttpRequestText', () => {
  it('parses a request line, headers, and body separated by a blank line', () => {
    const raw = ['POST /users?active=true HTTP/1.1', 'Host: api.example.com', 'Content-Type: application/json', '', '{"name":"a"}'].join(
      '\n',
    );
    const result = parseHttpRequestText(raw);
    expect(result.error).toBeNull();
    expect(result.request).toEqual({
      method: 'POST',
      url: 'https://api.example.com/users',
      queryParams: [{ key: 'active', value: 'true' }],
      headers: [{ key: 'Content-Type', value: 'application/json' }],
      body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
      auth: null,
    });
  });

  it('uses the assumed scheme when no absolute URL is given', () => {
    const result = parseHttpRequestText('GET /a HTTP/1.1\nHost: example.com\n\n', 'http');
    expect(result.request.url).toBe('http://example.com/a');
  });

  it('handles an absolute-form request target, ignoring any Host header', () => {
    const result = parseHttpRequestText('GET https://example.com/a?x=1 HTTP/1.1\nHost: other.example\n\n');
    expect(result.request.url).toBe('https://example.com/a');
    expect(result.request.queryParams).toEqual([{ key: 'x', value: '1' }]);
  });

  it('defaults to example.com when there is no Host header and no absolute target', () => {
    const result = parseHttpRequestText('GET / HTTP/1.1\n\n');
    expect(result.request.url).toBe('https://example.com/');
  });

  it('produces no body when the request ends right after the blank line', () => {
    const result = parseHttpRequestText('GET / HTTP/1.1\nHost: example.com\n\n');
    expect(result.request.body).toEqual({ kind: 'none' });
  });

  it('handles CRLF line endings', () => {
    const result = parseHttpRequestText('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n');
    expect(result.error).toBeNull();
    expect(result.request.url).toBe('https://example.com/');
  });

  it('reports an error for a missing/malformed request line, but stays populated with EMPTY_REQUEST', () => {
    const result = parseHttpRequestText('not a request line');
    expect(result.error).not.toBeNull();
    expect(result.request.method).toBe('GET');
    expect(result.request.url).toBe('');
  });

  it('treats empty input as EMPTY_REQUEST with no error', () => {
    const result = parseHttpRequestText('');
    expect(result.error).toBeNull();
    expect(result.request.url).toBe('');
  });
});
