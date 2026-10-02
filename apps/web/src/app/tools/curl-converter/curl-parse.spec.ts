import { parseCurl } from "@dude/tool-engine/tools/curl-converter/curl-parse";
import { EMPTY_REQUEST } from "@dude/domain/shared/http-request/http-request.model";

describe('parseCurl', () => {
  it('parses a representative real-world command', () => {
    const result = parseCurl(
      `curl -X POST https://api.example.com/users?active=true -H "Authorization: Bearer abc" -H "Content-Type: application/json" -d '{"name":"a"}'`,
    );

    expect(result.error).toBeNull();
    expect(result.request).toEqual({
      method: 'POST',
      url: 'https://api.example.com/users',
      queryParams: [{ key: 'active', value: 'true' }],
      headers: [
        { key: 'Authorization', value: 'Bearer abc' },
        { key: 'Content-Type', value: 'application/json' },
      ],
      body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/x-www-form-urlencoded' },
      auth: null,
    });
  });

  it('infers GET for a bare URL with no flags', () => {
    const result = parseCurl('curl https://example.com');
    expect(result.request.method).toBe('GET');
    expect(result.request.url).toBe('https://example.com');
    expect(result.request.body).toEqual({ kind: 'none' });
  });

  it('infers POST when -d is given without -X', () => {
    const result = parseCurl(`curl https://example.com -d 'a=1'`);
    expect(result.request.method).toBe('POST');
    expect(result.request.body).toEqual({ kind: 'raw', text: 'a=1', contentType: 'application/x-www-form-urlencoded' });
  });

  it('parses a multi-line, backslash-continued command identically to its single-line equivalent', () => {
    const singleLine = `curl -X POST https://example.com -H "Accept: */*" -d "a=1"`;
    const multiLine = 'curl -X POST https://example.com \\\n  -H "Accept: */*" \\\n  -d "a=1"';

    expect(parseCurl(multiLine).request).toEqual(parseCurl(singleLine).request);
  });

  it('produces a warning for an unsupported flag but still parses the rest', () => {
    const result = parseCurl('curl --cert client.pem https://example.com');
    expect(result.warnings).toEqual(['Ignored unsupported flag: --cert client.pem']);
    expect(result.request.url).toBe('https://example.com');
    expect(result.request.method).toBe('GET');
  });

  it('sets an error and falls back to EMPTY_REQUEST when the input does not start with "curl"', () => {
    const result = parseCurl('wget https://example.com');
    expect(result.error).toBe('Command must start with "curl".');
    expect(result.request).toEqual(EMPTY_REQUEST);
  });

  it('parses -F name=@file into a multipart field and warns about unread file contents', () => {
    const result = parseCurl('curl -F name=@file.txt https://example.com');
    expect(result.request.body).toEqual({ kind: 'multipart', fields: [{ key: 'name', value: '@file.txt' }] });
    expect(result.request.method).toBe('POST');
    expect(result.warnings).toEqual(['-F name=@file.txt: file contents are not read; the value is kept as a reference.']);
  });

  it('parses basic auth from -u', () => {
    const result = parseCurl('curl -u alice:secret https://example.com');
    expect(result.request.auth).toEqual({ username: 'alice', password: 'secret' });
  });

  it('returns an empty result for blank input', () => {
    const result = parseCurl('');
    expect(result).toEqual({ request: EMPTY_REQUEST, error: null, warnings: [] });
  });
});
