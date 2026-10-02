import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generatePhp } from "./curl-export-php.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generatePhp', () => {
  it('generates a curl_init/curl_setopt/curl_exec sequence with method, headers, and body', () => {
    const result = generatePhp(REQUEST);
    expect(result).toContain('$ch = curl_init("https://api.example.com/users");');
    expect(result).toContain('curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "POST");');
    expect(result).toContain('curl_setopt($ch, CURLOPT_HTTPHEADER, [\n    "Content-Type: application/json",\n]);');
    expect(result).toContain('curl_setopt($ch, CURLOPT_POSTFIELDS, "{\\"name\\":\\"a\\"}");');
    expect(result).toContain('$response = curl_exec($ch);');
  });

  it('sets CURLOPT_USERPWD for basic auth and an array for a multipart body', () => {
    const request: ParsedHttpRequest = {
      method: 'POST',
      url: 'https://example.com/upload',
      queryParams: [],
      headers: [],
      body: { kind: 'multipart', fields: [{ key: 'name', value: 'value' }] },
      auth: { username: 'alice', password: 'secret' },
    };

    const result = generatePhp(request);
    expect(result).toContain('curl_setopt($ch, CURLOPT_USERPWD, "alice:secret");');
    expect(result).toContain('$postFields = [\n    "name" => "value",\n];');
  });
});
