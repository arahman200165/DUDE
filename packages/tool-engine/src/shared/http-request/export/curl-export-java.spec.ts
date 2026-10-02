import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateJava } from "./curl-export-java.js";

const REQUEST: ParsedHttpRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  queryParams: [],
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: { kind: 'raw', text: '{"name":"a"}', contentType: 'application/json' },
  auth: null,
};

describe('generateJava', () => {
  it('generates an HttpClient/HttpRequest snippet with headers and a BodyPublishers.ofString body', () => {
    expect(generateJava(REQUEST)).toBe(
      [
        'import java.net.URI;',
        'import java.net.http.HttpClient;',
        'import java.net.http.HttpRequest;',
        'import java.net.http.HttpResponse;',
        '',
        'HttpClient client = HttpClient.newHttpClient();',
        'HttpRequest.Builder builder = HttpRequest.newBuilder()',
        '    .uri(URI.create("https://api.example.com/users"))',
        '    .header("Content-Type", "application/json")',
        '    .method("POST", HttpRequest.BodyPublishers.ofString("{\\"name\\":\\"a\\"}"));',
        '',
        'HttpRequest request = builder.build();',
        'HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());',
        'System.out.println(response.statusCode() + " " + response.body());',
      ].join('\n'),
    );
  });

  it('adds a Basic-auth header and flags multipart as best-effort', () => {
    const request: ParsedHttpRequest = {
      method: 'POST',
      url: 'https://example.com/upload',
      queryParams: [],
      headers: [],
      body: { kind: 'multipart', fields: [{ key: 'name', value: 'value' }] },
      auth: { username: 'alice', password: 'secret' },
    };

    const result = generateJava(request);
    expect(result).toContain(`.header("Authorization", "Basic ${btoa('alice:secret')}")`);
    expect(result).toContain('multipart bodies require manual boundary construction');
    expect(result).toContain('HttpRequest.BodyPublishers.noBody()');
  });
});
