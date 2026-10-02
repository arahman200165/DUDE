import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generatePowerShell } from "./curl-export-powershell.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generatePowerShell', () => {
  it('generates an Invoke-RestMethod call with headers and a body', () => {
    expect(generatePowerShell(REQUEST)).toBe(
      [
        '$headers = @{',
        "    'Content-Type' = 'application/json'",
        '}',
        '',
        '$body = \'{"name":"a"}\'',
        '',
        "Invoke-RestMethod -Uri 'https://api.example.com/users' -Method POST -Headers $headers -Body $body",
      ].join('\n'),
    );
  });

  it('builds a $form hashtable for multipart requests and a PSCredential for basic auth', () => {
    const request: ParsedHttpRequest = {
      method: 'POST',
      url: 'https://example.com/upload',
      queryParams: [],
      headers: [],
      body: { kind: 'multipart', fields: [{ key: 'name', value: 'value' }] },
      auth: { username: 'alice', password: 'secret' },
    };

    const result = generatePowerShell(request);
    expect(result).toContain('$form = @{');
    expect(result).toContain("    'name' = 'value'");
    expect(result).toContain('-Form $form');
    expect(result).toContain("$securePassword = ConvertTo-SecureString 'secret' -AsPlainText -Force");
    expect(result).toContain('-Authentication Basic');
    expect(result).toContain('-Credential $credential');
  });

  it('escapes an embedded single quote in a header value', () => {
    const request: ParsedHttpRequest = {
      ...REQUEST,
      headers: [{ key: 'X-Note', value: "it's here" }],
    };

    expect(generatePowerShell(request)).toContain("'X-Note' = 'it''s here'");
  });
});
