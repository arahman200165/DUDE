import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateKotlin } from "./curl-export-kotlin.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateKotlin', () => {
  it('generates an OkHttp Request.Builder chain with a request body', () => {
    const result = generateKotlin(REQUEST);
    expect(result).toContain('val mediaType = "application/json".toMediaType()');
    expect(result).toContain('val body = "{\\"name\\":\\"a\\"}".toRequestBody(mediaType)');
    expect(result).toContain('.url("https://api.example.com/users")');
    expect(result).toContain('.method("POST", body)');
    expect(result).toContain('.addHeader("Content-Type", "application/json")');
    expect(result).toContain('client.newCall(request).execute()');
  });

  it('passes null as the body for a GET request', () => {
    const request: ParsedHttpRequest = { ...REQUEST, method: 'GET', body: { kind: 'none' } };
    expect(generateKotlin(request)).toContain('.method("GET", null)');
  });

  it('adds a Basic auth header when auth is present', () => {
    const request: ParsedHttpRequest = { ...REQUEST, auth: { username: 'alice', password: 'secret' } };
    expect(generateKotlin(request)).toContain('.addHeader("Authorization", "Basic YWxpY2U6c2VjcmV0")');
  });
});
