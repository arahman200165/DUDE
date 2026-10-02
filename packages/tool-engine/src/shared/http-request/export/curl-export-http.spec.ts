import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateRawHttp } from "./curl-export-http.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [{ key: 'active', value: 'true' }],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateRawHttp', () => {
  it('generates a literal HTTP/1.1 request with a synthesized Host and Content-Length', () => {
    expect(generateRawHttp(REQUEST)).toBe(
      [
        'POST /users?active=true HTTP/1.1',
        'Host: api.example.com',
        'Content-Type: application/json',
        'Content-Length: 12',
        '',
        '{"name":"a"}',
      ].join('\r\n'),
    );
  });

  it('synthesizes an Authorization header for basic auth', () => {
    const request: ParsedHttpRequest = {
      method: 'GET',
      url: 'https://example.com/secure',
      queryParams: [],
      headers: [],
      body: { kind: 'none' },
      auth: { username: 'alice', password: 'secret' },
    };

    const result = generateRawHttp(request);
    expect(result).toContain(`Authorization: Basic ${btoa('alice:secret')}`);
  });
});
