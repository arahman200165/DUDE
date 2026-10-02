/**
 * Pure, framework-free `multipart/form-data` body preview builder (RFC 7578) —
 * construct-and-display only. A file field's content can't be shown as readable
 * text, so it's rendered as a `<binary data: N bytes>` placeholder, the same
 * convention curl-parse.ts already uses for an unread `@file` reference.
 */
export interface TextField {
  readonly kind: 'text';
  readonly key: string;
  readonly value: string;
}

export interface FileField {
  readonly kind: 'file';
  readonly key: string;
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
}

export type MultipartField = TextField | FileField;

export function generateBoundary(randomHex: string): string {
  return `----DUDEFormBoundary${randomHex}`;
}

export function contentTypeHeader(boundary: string): string {
  return `multipart/form-data; boundary=${boundary}`;
}

export function buildMultipartBody(fields: readonly MultipartField[], boundary: string): string {
  const parts: string[] = [];

  for (const field of fields) {
    if (field.key === '') continue;

    if (field.kind === 'text') {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${field.key}"\r\n\r\n${field.value}`);
    } else {
      const contentType = field.contentType !== '' ? field.contentType : 'application/octet-stream';
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field.key}"; filename="${field.filename}"\r\nContent-Type: ${contentType}\r\n\r\n<binary data: ${field.size} bytes>`,
      );
    }
  }

  parts.push(`--${boundary}--`);
  return parts.join('\r\n');
}
