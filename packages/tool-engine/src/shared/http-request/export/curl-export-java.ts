import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** Generates a Java java.net.http.HttpClient snippet (Java 11+). Multipart is best-effort (no native helper). */
export function generateJava(request: ParsedHttpRequest): string {
  const lines: string[] = [
    'import java.net.URI;',
    'import java.net.http.HttpClient;',
    'import java.net.http.HttpRequest;',
    'import java.net.http.HttpResponse;',
    '',
    'HttpClient client = HttpClient.newHttpClient();',
    'HttpRequest.Builder builder = HttpRequest.newBuilder()',
    `    .uri(URI.create(${JSON.stringify(buildFullUrl(request))}))`,
  ];

  for (const header of request.headers) {
    lines.push(`    .header(${JSON.stringify(header.key)}, ${JSON.stringify(header.value)})`);
  }

  if (request.auth) {
    const encoded = btoa(`${request.auth.username}:${request.auth.password}`);
    lines.push(`    .header("Authorization", "Basic ${encoded}")`);
  }

  let bodyPublisher = 'HttpRequest.BodyPublishers.noBody()';
  if (request.body.kind === 'raw' && request.body.text !== '') {
    bodyPublisher = `HttpRequest.BodyPublishers.ofString(${JSON.stringify(request.body.text)})`;
  } else if (request.body.kind === 'multipart') {
    lines.push('    // NOTE: multipart bodies require manual boundary construction with this API (best-effort).');
  }

  lines.push(`    .method(${JSON.stringify(request.method)}, ${bodyPublisher});`, '');
  lines.push('HttpRequest request = builder.build();');
  lines.push('HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());');
  lines.push('System.out.println(response.statusCode() + " " + response.body());');

  return lines.join('\n');
}
