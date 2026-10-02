import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** Generates a C# snippet using System.Net.Http.HttpClient. */
export function generateCSharp(request: ParsedHttpRequest): string {
  const lines: string[] = [
    'using System;',
    'using System.Net.Http;',
    'using System.Net.Http.Headers;',
    'using System.Text;',
    'using System.Threading.Tasks;',
    '',
    'var client = new HttpClient();',
    `var request = new HttpRequestMessage(new HttpMethod(${JSON.stringify(request.method)}), ${JSON.stringify(buildFullUrl(request))});`,
  ];

  for (const header of request.headers) {
    lines.push(`request.Headers.TryAddWithoutValidation(${JSON.stringify(header.key)}, ${JSON.stringify(header.value)});`);
  }

  if (request.auth) {
    const encoded = btoa(`${request.auth.username}:${request.auth.password}`);
    lines.push(`request.Headers.Authorization = new AuthenticationHeaderValue("Basic", ${JSON.stringify(encoded)});`);
  }

  if (request.body.kind === 'raw' && request.body.text !== '') {
    const contentType = request.body.contentType ?? 'text/plain';
    lines.push(
      `request.Content = new StringContent(${JSON.stringify(request.body.text)}, Encoding.UTF8, ${JSON.stringify(contentType)});`,
    );
  } else if (request.body.kind === 'multipart') {
    lines.push('var multipartContent = new MultipartFormDataContent();');
    for (const field of request.body.fields) {
      lines.push(`multipartContent.Add(new StringContent(${JSON.stringify(field.value)}), ${JSON.stringify(field.key)});`);
    }
    lines.push('request.Content = multipartContent;');
  }

  lines.push(
    '',
    'var response = await client.SendAsync(request);',
    'Console.WriteLine(await response.Content.ReadAsStringAsync());',
  );

  return lines.join('\n');
}
