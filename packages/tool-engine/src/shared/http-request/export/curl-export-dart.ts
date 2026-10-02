import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** The `http` package's top-level convenience functions; OPTIONS has none, so it falls back to a generic http.Request. */
const METHOD_FUNCTIONS: Record<string, string> = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'delete',
  HEAD: 'head',
};

function headersMapLiteral(headers: ParsedHttpRequest['headers'], indent: string): string[] {
  if (headers.length === 0) return [];
  const lines = [`${indent}headers: {`];
  for (const header of headers) {
    lines.push(`${indent}  ${JSON.stringify(header.key)}: ${JSON.stringify(header.value)},`);
  }
  lines.push(`${indent}},`);
  return lines;
}

/** Generates a Dart snippet using the `http` package. */
export function generateDart(request: ParsedHttpRequest): string {
  const method = request.method.toUpperCase();
  const fn = METHOD_FUNCTIONS[method];
  const url = buildFullUrl(request);
  const hasBody = request.body.kind === 'raw' && request.body.text !== '';

  const headers = request.auth
    ? [...request.headers, { key: 'Authorization', value: `Basic ${btoa(`${request.auth.username}:${request.auth.password}`)}` }]
    : request.headers;

  const lines: string[] = ["import 'package:http/http.dart' as http;", '', 'void main() async {'];

  if (fn) {
    lines.push(`  final response = await http.${fn}(`, `    Uri.parse(${JSON.stringify(url)}),`);
    lines.push(...headersMapLiteral(headers, '    '));
    if (hasBody && request.body.kind === 'raw') {
      lines.push(`    body: ${JSON.stringify(request.body.text)},`);
    }
    lines.push('  );');
  } else {
    lines.push(`  final request = http.Request(${JSON.stringify(method)}, Uri.parse(${JSON.stringify(url)}));`);
    for (const header of headers) {
      lines.push(`  request.headers[${JSON.stringify(header.key)}] = ${JSON.stringify(header.value)};`);
    }
    if (hasBody && request.body.kind === 'raw') {
      lines.push(`  request.body = ${JSON.stringify(request.body.text)};`);
    }
    lines.push('  final streamed = await http.Client().send(request);', '  final response = await http.Response.fromStream(streamed);');
  }

  if (request.body.kind === 'multipart') {
    lines.push('  // NOTE: multipart bodies need http.MultipartRequest with this package (best-effort).');
  }

  lines.push('', "  print('${response.statusCode} ${response.body}');", '}');

  return lines.join('\n');
}
