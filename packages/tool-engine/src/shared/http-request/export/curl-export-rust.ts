import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** Method-specific `Client` builders reqwest provides; anything else falls back to `.request(Method::from_bytes(...))`. */
const METHOD_BUILDERS: Record<string, string> = {
  GET: 'get',
  POST: 'post',
  PUT: 'put',
  PATCH: 'patch',
  DELETE: 'delete',
  HEAD: 'head',
};

function escapeRustString(value: string): string {
  return JSON.stringify(value);
}

/** Generates a Rust `reqwest` (blocking client) snippet. */
export function generateRust(request: ParsedHttpRequest): string {
  const lines: string[] = ['use reqwest::blocking::Client;', '', 'fn main() -> Result<(), Box<dyn std::error::Error>> {', '    let client = Client::new();'];

  const method = request.method.toUpperCase();
  const builder = METHOD_BUILDERS[method];
  const call = builder
    ? `.${builder}(${escapeRustString(buildFullUrl(request))})`
    : `.request(reqwest::Method::from_bytes(${escapeRustString(method)}.as_bytes())?, ${escapeRustString(buildFullUrl(request))})`;

  lines.push('    let response = client', `        ${call}`);

  for (const header of request.headers) {
    lines.push(`        .header(${escapeRustString(header.key)}, ${escapeRustString(header.value)})`);
  }

  if (request.auth) {
    lines.push(`        .basic_auth(${escapeRustString(request.auth.username)}, Some(${escapeRustString(request.auth.password)}))`);
  }

  if (request.body.kind === 'raw' && request.body.text !== '') {
    lines.push(`        .body(${escapeRustString(request.body.text)})`);
  } else if (request.body.kind === 'multipart') {
    lines.push('        // NOTE: multipart bodies need a reqwest::blocking::multipart::Form with this API (best-effort).');
  }

  lines.push('        .send()?;', '', '    println!("{} {}", response.status(), response.text()?);', '    Ok(())', '}');

  return lines.join('\n');
}
