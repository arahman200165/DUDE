import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** Generates a Go net/http snippet. Multipart support is best-effort (manual mime/multipart construction). */
export function generateGo(request: ParsedHttpRequest): string {
  const hasRawBody = request.body.kind === 'raw' && request.body.text !== '';
  const isMultipart = request.body.kind === 'multipart';

  const importLines = ['\t"fmt"', '\t"io"', '\t"net/http"'];
  if (hasRawBody) importLines.push('\t"strings"');
  if (isMultipart) importLines.push('\t"bytes"', '\t"mime/multipart"');

  const lines: string[] = ['package main', '', 'import (', ...importLines, ')', '', 'func main() {'];

  let bodyVar = 'nil';
  if (hasRawBody && request.body.kind === 'raw') {
    lines.push(`\tbody := strings.NewReader(${JSON.stringify(request.body.text)})`);
    bodyVar = 'body';
  } else if (request.body.kind === 'multipart') {
    lines.push('\tvar buf bytes.Buffer', '\twriter := multipart.NewWriter(&buf)');
    for (const field of request.body.fields) {
      lines.push(`\twriter.WriteField(${JSON.stringify(field.key)}, ${JSON.stringify(field.value)})`);
    }
    lines.push('\twriter.Close()');
    bodyVar = '&buf';
  }

  lines.push(
    `\treq, err := http.NewRequest(${JSON.stringify(request.method)}, ${JSON.stringify(buildFullUrl(request))}, ${bodyVar})`,
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '',
  );

  for (const header of request.headers) {
    lines.push(`\treq.Header.Set(${JSON.stringify(header.key)}, ${JSON.stringify(header.value)})`);
  }

  if (request.body.kind === 'multipart') {
    lines.push('\treq.Header.Set("Content-Type", writer.FormDataContentType())');
  }

  if (request.auth) {
    lines.push(`\treq.SetBasicAuth(${JSON.stringify(request.auth.username)}, ${JSON.stringify(request.auth.password)})`);
  }

  lines.push(
    '',
    '\tresp, err := http.DefaultClient.Do(req)',
    '\tif err != nil {',
    '\t\tpanic(err)',
    '\t}',
    '\tdefer resp.Body.Close()',
    '',
    '\trespBody, _ := io.ReadAll(resp.Body)',
    '\tfmt.Println(resp.StatusCode, string(respBody))',
    '}',
  );

  return lines.join('\n');
}
