import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateDart } from "./curl-export-dart.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateDart', () => {
  it('generates an http.post() call with headers and body', () => {
    const result = generateDart(REQUEST);
    expect(result).toContain("import 'package:http/http.dart' as http;");
    expect(result).toContain('final response = await http.post(');
    expect(result).toContain('Uri.parse("https://api.example.com/users"),');
    expect(result).toContain('"Content-Type": "application/json",');
    expect(result).toContain('body: "{\\"name\\":\\"a\\"}",');
  });

  it('falls back to a generic http.Request for OPTIONS, which has no convenience function', () => {
    const request: ParsedHttpRequest = { ...REQUEST, method: 'OPTIONS' };
    const result = generateDart(request);
    expect(result).toContain('final request = http.Request("OPTIONS", Uri.parse("https://api.example.com/users"));');
    expect(result).toContain('http.Client().send(request)');
  });

  it('adds a Basic Authorization header when auth is present', () => {
    const request: ParsedHttpRequest = { ...REQUEST, auth: { username: 'alice', password: 'secret' } };
    expect(generateDart(request)).toContain('"Authorization": "Basic YWxpY2U6c2VjcmV0",');
  });
});
