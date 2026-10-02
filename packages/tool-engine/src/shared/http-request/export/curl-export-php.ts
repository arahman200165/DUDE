import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** Generates a PHP snippet using the built-in `curl` extension (no external dependency). */
export function generatePhp(request: ParsedHttpRequest): string {
  const lines: string[] = ['<?php', `$ch = curl_init(${JSON.stringify(buildFullUrl(request))});`, `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${JSON.stringify(request.method)});`, 'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);'];

  if (request.headers.length > 0) {
    lines.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [');
    for (const header of request.headers) {
      lines.push(`    ${JSON.stringify(`${header.key}: ${header.value}`)},`);
    }
    lines.push(']);');
  }

  if (request.auth) {
    lines.push(`curl_setopt($ch, CURLOPT_USERPWD, ${JSON.stringify(`${request.auth.username}:${request.auth.password}`)});`);
  }

  if (request.body.kind === 'raw' && request.body.text !== '') {
    lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${JSON.stringify(request.body.text)});`);
  } else if (request.body.kind === 'multipart') {
    lines.push('$postFields = [');
    for (const field of request.body.fields) {
      lines.push(`    ${JSON.stringify(field.key)} => ${JSON.stringify(field.value)},`);
    }
    lines.push('];', 'curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);');
  }

  lines.push('', '$response = curl_exec($ch);', '$statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);', 'curl_close($ch);', '', 'echo $statusCode . "\\n" . $response;');

  return lines.join('\n');
}
