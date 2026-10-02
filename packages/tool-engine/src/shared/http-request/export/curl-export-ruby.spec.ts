import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateRuby } from "./curl-export-ruby.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateRuby', () => {
  it('generates a Net::HTTP request with method class, headers, and body', () => {
    const result = generateRuby(REQUEST);
    expect(result).toContain('uri = URI("https://api.example.com/users")');
    expect(result).toContain('request = Net::HTTP::Post.new(uri)');
    expect(result).toContain('request["Content-Type"] = "application/json"');
    expect(result).toContain('request.body = "{\\"name\\":\\"a\\"}"');
    expect(result).toContain('response = http.request(request)');
  });

  it('falls back to a generic request for a method with no dedicated class', () => {
    const request: ParsedHttpRequest = { ...REQUEST, method: 'PROPFIND' };
    const result = generateRuby(request);
    expect(result).toContain('Net::HTTPGenericRequest.new("PROPFIND", true, true, uri)');
  });

  it('adds request.basic_auth() when auth is present', () => {
    const request: ParsedHttpRequest = { ...REQUEST, auth: { username: 'alice', password: 'secret' } };
    expect(generateRuby(request)).toContain('request.basic_auth("alice", "secret")');
  });
});
