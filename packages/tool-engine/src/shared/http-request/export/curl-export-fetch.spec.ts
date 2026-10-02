import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateFetch } from "./curl-export-fetch.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateFetch', () => {
  it('generates a fetch() call with method, headers, and body', () => {
    expect(generateFetch(REQUEST)).toBe(
      [
        'fetch("https://api.example.com/users", {',
        '  method: "POST",',
        '  headers: {',
        '    "Content-Type": "application/json",',
        '  },',
        '  body: "{\\"name\\":\\"a\\"}",',
        '});',
      ].join('\n'),
    );
  });

  it('uses FormData and a Basic-auth header for a multipart request with auth', () => {
    const request: ParsedHttpRequest = {
      method: 'POST',
      url: 'https://example.com/upload',
      queryParams: [],
      headers: [],
      body: {
        kind: 'multipart',
        fields: [
          { key: 'name', value: 'value' },
          { key: 'file', value: '@photo.png' },
        ],
      },
      auth: { username: 'alice', password: 'secret' },
    };

    const result = generateFetch(request);
    expect(result).toContain('const formData = new FormData();');
    expect(result).toContain('formData.append("name", "value");');
    expect(result).toContain('formData.append("file", "@photo.png");');
    expect(result).toContain('body: formData,');
    expect(result).toContain(`"Authorization": "Basic ${btoa('alice:secret')}"`);
  });
});
