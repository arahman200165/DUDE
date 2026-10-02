import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** Generates a Swift `URLSession`/`URLRequest` (Foundation, no external dependency) snippet. */
export function generateSwift(request: ParsedHttpRequest): string {
  const lines: string[] = [
    'import Foundation',
    '',
    `var request = URLRequest(url: URL(string: ${JSON.stringify(buildFullUrl(request))})!)`,
    `request.httpMethod = ${JSON.stringify(request.method)}`,
  ];

  for (const header of request.headers) {
    lines.push(`request.setValue(${JSON.stringify(header.value)}, forHTTPHeaderField: ${JSON.stringify(header.key)})`);
  }

  if (request.auth) {
    const encoded = btoa(`${request.auth.username}:${request.auth.password}`);
    lines.push(`request.setValue("Basic ${encoded}", forHTTPHeaderField: "Authorization")`);
  }

  if (request.body.kind === 'raw' && request.body.text !== '') {
    lines.push(`request.httpBody = ${JSON.stringify(request.body.text)}.data(using: .utf8)`);
  } else if (request.body.kind === 'multipart') {
    lines.push('// NOTE: multipart bodies need manual boundary construction with this API (best-effort).');
  }

  lines.push(
    '',
    'let task = URLSession.shared.dataTask(with: request) { data, response, error in',
    '    if let data = data, let httpResponse = response as? HTTPURLResponse {',
    '        print(httpResponse.statusCode, String(data: data, encoding: .utf8) ?? "")',
    '    }',
    '}',
    'task.resume()',
  );

  return lines.join('\n');
}
