import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generatePython } from "./curl-export-python.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generatePython', () => {
  it('generates a requests.request() call with method, headers, and body', () => {
    expect(generatePython(REQUEST)).toBe(
      [
        'import requests',
        '',
        'headers = {',
        '    "Content-Type": "application/json",',
        '}',
        '',
        'payload = "{\\"name\\":\\"a\\"}"',
        '',
        'response = requests.request("POST", "https://api.example.com/users", headers=headers, data=payload)',
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

    const result = generatePython(request);
    expect(result).toContain('files = {\n    "name": "value",\n}');
    expect(result).toContain('files=files');
    expect(result).toContain('auth=("alice", "secret")');
  });
});
