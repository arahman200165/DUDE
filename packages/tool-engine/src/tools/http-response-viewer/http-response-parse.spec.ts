import { parseHttpResponseText } from "./http-response-parse.js";

describe('parseHttpResponseText', () => {
  it('parses a status line, headers, and a JSON body, pretty-printing it', () => {
    const raw = ['HTTP/1.1 200 OK', 'Content-Type: application/json', 'X-Request-Id: abc123', '', '{"ok":true,"data":[1,2]}'].join('\n');
    const result = parseHttpResponseText(raw);
    expect(result.ok).toBe(true);
    expect(result.ok && result.httpVersion).toBe('1.1');
    expect(result.ok && result.statusCode).toBe(200);
    expect(result.ok && result.statusText).toBe('OK');
    expect(result.ok && result.headers).toEqual([
      { key: 'Content-Type', value: 'application/json' },
      { key: 'X-Request-Id', value: 'abc123' },
    ]);
    expect(result.ok && result.bodyIsJson).toBe(true);
    expect(result.ok && result.bodyPretty).toBe('{\n  "ok": true,\n  "data": [\n    1,\n    2\n  ]\n}');
  });

  it('leaves a non-JSON body unchanged', () => {
    const result = parseHttpResponseText('HTTP/1.1 200 OK\nContent-Type: text/plain\n\nhello world');
    expect(result.ok).toBe(true);
    expect(result.ok && result.bodyIsJson).toBe(false);
    expect(result.ok && result.bodyPretty).toBe('hello world');
    expect(result.ok && result.bodyRaw).toBe('hello world');
  });

  it('handles a response with no body', () => {
    const result = parseHttpResponseText('HTTP/1.1 204 No Content\n\n');
    expect(result.ok).toBe(true);
    expect(result.ok && result.bodyRaw).toBe('');
  });

  it('handles a status line with no reason phrase', () => {
    const result = parseHttpResponseText('HTTP/2 404\n\n');
    expect(result.ok).toBe(true);
    expect(result.ok && result.httpVersion).toBe('2');
    expect(result.ok && result.statusCode).toBe(404);
    expect(result.ok && result.statusText).toBe('');
  });

  it('handles CRLF line endings', () => {
    const result = parseHttpResponseText('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nbody');
    expect(result.ok).toBe(true);
    expect(result.ok && result.bodyRaw).toBe('body');
  });

  it('errors on a missing/malformed status line', () => {
    expect(parseHttpResponseText('not a status line').ok).toBe(false);
  });

  it('errors on empty input', () => {
    expect(parseHttpResponseText('').ok).toBe(false);
  });
});
