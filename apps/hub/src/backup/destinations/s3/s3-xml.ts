/**
 * The few S3 XML documents the destination reads (Milestone 848). Deliberately tiny and tag-based: the documents are flat, the
 * tags are known, and nothing here evaluates entities beyond the five predefined ones and numeric references. An unexpected shape
 * yields `undefined`/empty results that the caller turns into a typed error; this is never a general XML parser.
 */
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return ENTITIES[entity] ?? whole;
  });
}

export const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The decoded text of the first `<tag>` in `xml`, or undefined. */
export function xmlText(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match === null ? undefined : decodeXml(match[1] as string);
}

/** The inner XML of every `<tag>` block. */
export function xmlBlocks(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  for (let match = re.exec(xml); match !== null; match = re.exec(xml)) out.push(match[1] as string);
  return out;
}

export interface S3ErrorBody {
  code: string | undefined;
  message: string | undefined;
}

/** `<Error><Code>…</Code><Message>…</Message></Error>`; the code is kept only when it is a plain identifier. */
export function parseErrorBody(xml: string): S3ErrorBody {
  const code = xmlText(xml, 'Code');
  const message = xmlText(xml, 'Message');
  return { code: code !== undefined && /^[A-Za-z0-9]{1,64}$/.test(code) ? code : undefined, message };
}

export interface ListedObject {
  key: string;
  size: number;
}

export interface ListObjectsPage {
  objects: ListedObject[];
  truncated: boolean;
  nextToken: string | undefined;
}

export function parseListObjectsV2(xml: string): ListObjectsPage {
  const objects: ListedObject[] = [];
  for (const block of xmlBlocks(xml, 'Contents')) {
    const key = xmlText(block, 'Key');
    const size = Number(xmlText(block, 'Size'));
    if (key !== undefined && Number.isSafeInteger(size) && size >= 0) objects.push({ key, size });
  }
  return { objects, truncated: xmlText(xml, 'IsTruncated') === 'true', nextToken: xmlText(xml, 'NextContinuationToken') };
}

export interface ListedUpload {
  key: string;
  uploadId: string;
  initiated: number;
}

export interface ListUploadsPage {
  uploads: ListedUpload[];
  truncated: boolean;
  nextKeyMarker: string | undefined;
  nextUploadIdMarker: string | undefined;
}

export function parseListMultipartUploads(xml: string): ListUploadsPage {
  const uploads: ListedUpload[] = [];
  for (const block of xmlBlocks(xml, 'Upload')) {
    const key = xmlText(block, 'Key');
    const uploadId = xmlText(block, 'UploadId');
    const initiated = Date.parse(xmlText(block, 'Initiated') ?? '');
    if (key !== undefined && uploadId !== undefined && !Number.isNaN(initiated)) uploads.push({ key, uploadId, initiated });
  }
  return { uploads, truncated: xmlText(xml, 'IsTruncated') === 'true', nextKeyMarker: xmlText(xml, 'NextKeyMarker'), nextUploadIdMarker: xmlText(xml, 'NextUploadIdMarker') };
}

export function completeMultipartXml(parts: Array<{ partNumber: number; etag: string }>): string {
  return `<CompleteMultipartUpload>${parts.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
}
