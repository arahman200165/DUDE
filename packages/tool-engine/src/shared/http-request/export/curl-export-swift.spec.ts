import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateSwift } from "./curl-export-swift.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateSwift', () => {
  it('generates a URLRequest with method, headers, and httpBody', () => {
    const result = generateSwift(REQUEST);
    expect(result).toContain('var request = URLRequest(url: URL(string: "https://api.example.com/users")!)');
    expect(result).toContain('request.httpMethod = "POST"');
    expect(result).toContain('request.setValue("application/json", forHTTPHeaderField: "Content-Type")');
    expect(result).toContain('request.httpBody = "{\\"name\\":\\"a\\"}".data(using: .utf8)');
    expect(result).toContain('URLSession.shared.dataTask(with: request)');
  });

  it('sets a Basic Authorization header when auth is present', () => {
    const request: ParsedHttpRequest = { ...REQUEST, auth: { username: 'alice', password: 'secret' } };
    expect(generateSwift(request)).toContain('request.setValue("Basic YWxpY2U6c2VjcmV0", forHTTPHeaderField: "Authorization")');
  });

  it('notes multipart bodies as best-effort', () => {
    const request: ParsedHttpRequest = { ...REQUEST, body: { kind: 'multipart', fields: [{ key: 'name', value: 'value' }] } };
    expect(generateSwift(request)).toContain('// NOTE: multipart bodies need manual boundary construction');
  });
});
