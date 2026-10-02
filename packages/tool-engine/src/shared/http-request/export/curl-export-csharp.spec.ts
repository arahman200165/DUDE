import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateCSharp } from "./curl-export-csharp.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateCSharp', () => {
  it('generates an HttpClient/HttpRequestMessage snippet with headers and a StringContent body', () => {
    expect(generateCSharp(REQUEST)).toBe(
      [
        'using System;',
        'using System.Net.Http;',
        'using System.Net.Http.Headers;',
        'using System.Text;',
        'using System.Threading.Tasks;',
        '',
        'var client = new HttpClient();',
        'var request = new HttpRequestMessage(new HttpMethod("POST"), "https://api.example.com/users");',
        'request.Headers.TryAddWithoutValidation("Content-Type", "application/json");',
        'request.Content = new StringContent("{\\"name\\":\\"a\\"}", Encoding.UTF8, "application/json");',
        '',
        'var response = await client.SendAsync(request);',
        'Console.WriteLine(await response.Content.ReadAsStringAsync());',
      ].join('\n'),
    );
  });

  it('uses MultipartFormDataContent for a multipart request and an AuthenticationHeaderValue for basic auth', () => {
    const request: ParsedHttpRequest = {
      method: 'POST',
      url: 'https://example.com/upload',
      queryParams: [],
      headers: [],
      body: { kind: 'multipart', fields: [{ key: 'name', value: 'value' }] },
      auth: { username: 'alice', password: 'secret' },
    };

    const result = generateCSharp(request);
    expect(result).toContain('var multipartContent = new MultipartFormDataContent();');
    expect(result).toContain('multipartContent.Add(new StringContent("value"), "name");');
    expect(result).toContain('request.Content = multipartContent;');
    expect(result).toContain(`new AuthenticationHeaderValue("Basic", "${btoa('alice:secret')}")`);
  });
});
