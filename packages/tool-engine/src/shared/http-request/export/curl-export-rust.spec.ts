import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateRust } from "./curl-export-rust.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateRust', () => {
  it('generates a reqwest blocking client call with a method builder, headers, and body', () => {
    const result = generateRust(REQUEST);
    expect(result).toContain('use reqwest::blocking::Client;');
    expect(result).toContain('.post("https://api.example.com/users")');
    expect(result).toContain('.header("Content-Type", "application/json")');
    expect(result).toContain('.body("{\\"name\\":\\"a\\"}")');
    expect(result).toContain('.send()?;');
  });

  it('falls back to Method::from_bytes for a method with no dedicated builder', () => {
    const request: ParsedHttpRequest = { ...REQUEST, method: 'PROPFIND' };
    expect(generateRust(request)).toContain('.request(reqwest::Method::from_bytes("PROPFIND".as_bytes())?, "https://api.example.com/users")');
  });

  it('adds .basic_auth() when auth is present', () => {
    const request: ParsedHttpRequest = { ...REQUEST, auth: { username: 'alice', password: 'secret' } };
    expect(generateRust(request)).toContain('.basic_auth("alice", Some("secret"))');
  });
});
