import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

/** Generates a Kotlin OkHttp snippet — the standard JVM/Android HTTP client, distinct from the Java generator's java.net.http.HttpClient. */
export function generateKotlin(request: ParsedHttpRequest): string {
  const lines: string[] = [
    'import okhttp3.MediaType.Companion.toMediaType',
    'import okhttp3.OkHttpClient',
    'import okhttp3.Request',
    'import okhttp3.RequestBody.Companion.toRequestBody',
    '',
    'val client = OkHttpClient()',
    '',
  ];

  let bodyVar = 'null';
  if (request.body.kind === 'raw' && request.body.text !== '') {
    const mediaType = request.body.contentType ?? 'text/plain';
    lines.push(`val mediaType = ${JSON.stringify(mediaType)}.toMediaType()`, `val body = ${JSON.stringify(request.body.text)}.toRequestBody(mediaType)`, '');
    bodyVar = 'body';
  } else if (request.body.kind === 'multipart') {
    lines.push('// NOTE: multipart bodies need a MultipartBody.Builder with this API (best-effort).', '');
  } else if (!METHODS_WITHOUT_BODY.has(request.method.toUpperCase())) {
    lines.push(`val body = "".toRequestBody(null)`, '');
    bodyVar = 'body';
  }

  lines.push('val request = Request.Builder()', `    .url(${JSON.stringify(buildFullUrl(request))})`, `    .method(${JSON.stringify(request.method)}, ${bodyVar})`);

  for (const header of request.headers) {
    lines.push(`    .addHeader(${JSON.stringify(header.key)}, ${JSON.stringify(header.value)})`);
  }

  if (request.auth) {
    const encoded = btoa(`${request.auth.username}:${request.auth.password}`);
    lines.push(`    .addHeader("Authorization", "Basic ${encoded}")`);
  }

  lines.push('    .build()', '', 'val response = client.newCall(request).execute()', 'println("${response.code} ${response.body?.string()}")');

  return lines.join('\n');
}
