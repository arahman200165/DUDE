import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generatePythonHttpx } from "./curl-export-python-httpx.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generatePythonHttpx', () => {
  it('generates an httpx.request() call with method, headers, and content=', () => {
    expect(generatePythonHttpx(REQUEST)).toBe(
      [
        'import httpx',
        '',
        'headers = {',
        '    "Content-Type": "application/json",',
        '}',
        '',
        'payload = "{\\"name\\":\\"a\\"}"',
        '',
        'response = httpx.request("POST", "https://api.example.com/users", headers=headers, content=payload)',
        'print(response.status_code, response.text)',
      ].join('\n'),
    );
  });

  it('uses files= for a multipart request and auth= for basic auth', () => {
    const request: ParsedHttpRequest = {
      method: 'POST',
      url: 'https://example.com/upload',
      queryParams: [],
      headers: [],
      body: { kind: 'multipart', fields: [{ key: 'name', value: 'value' }] },
      auth: { username: 'alice', password: 'secret' },
    };

    const result = generatePythonHttpx(request);
    expect(result).toContain('files = {\n    "name": "value",\n}');
    expect(result).toContain('files=files');
    expect(result).toContain('auth=("alice", "secret")');
  });
});
