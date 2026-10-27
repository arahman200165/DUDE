import { describe, expect, it } from 'vitest';
import { completeMultipartXml, decodeXml, escapeXml, parseErrorBody, parseListMultipartUploads, parseListObjectsV2, xmlBlocks, xmlText } from './s3-xml.js';

describe('S3 XML helpers', () => {
  it('decodes the five predefined entities and numeric references, and leaves anything else alone', () => {
    expect(decodeXml('a&amp;b &lt;c&gt; &quot;d&quot; &apos;e&apos;')).toBe(`a&b <c> "d" 'e'`);
    expect(decodeXml('&#65;&#x42;&#x1F600;')).toBe('AB\u{1F600}');
    expect(decodeXml('&nbsp;&custom;')).toBe('&nbsp;&custom;');
    // A double-escaped entity is decoded exactly once.
    expect(decodeXml('&amp;lt;')).toBe('&lt;');
  });

  it('escapes the characters that matter in element text', () => {
    expect(escapeXml('a&b<c>"d"')).toBe('a&amp;b&lt;c&gt;&quot;d&quot;');
    expect(decodeXml(escapeXml('"quoted" & <tag>'))).toBe('"quoted" & <tag>');
  });

  it('reads the first tag, tolerating attributes, and returns undefined when absent', () => {
    expect(xmlText('<A><B>one</B><B>two</B></A>', 'B')).toBe('one');
    expect(xmlText('<Key xmlns="x">k&amp;1</Key>', 'Key')).toBe('k&1');
    expect(xmlText('<A></A>', 'B')).toBeUndefined();
    expect(xmlText('<A><B></B></A>', 'B')).toBe('');
    // A tag whose name merely starts with the wanted one is not a match.
    expect(xmlText('<KeyCount>3</KeyCount>', 'Key')).toBeUndefined();
  });

  it('lists every block of a tag', () => {
    expect(xmlBlocks('<R><C><K>1</K></C><C><K>2</K></C></R>', 'C')).toEqual(['<K>1</K>', '<K>2</K>']);
    expect(xmlBlocks('<R/>', 'C')).toEqual([]);
  });
});

describe('parseErrorBody', () => {
  it('reads the code and message of an S3 error document', () => {
    const parsed = parseErrorBody('<?xml version="1.0"?><Error><Code>SlowDown</Code><Message>Please &amp; reduce</Message><RequestId>R</RequestId></Error>');
    expect(parsed).toEqual({ code: 'SlowDown', message: 'Please & reduce' });
  });

  it('keeps the code only when it is a plain identifier', () => {
    expect(parseErrorBody('<Error><Code>Bad Code!</Code></Error>').code).toBeUndefined();
    expect(parseErrorBody('<Error><Code></Code></Error>').code).toBeUndefined();
    expect(parseErrorBody(`<Error><Code>${'A'.repeat(65)}</Code></Error>`).code).toBeUndefined();
    expect(parseErrorBody(`<Error><Code>${'A'.repeat(64)}</Code></Error>`).code).toBe('A'.repeat(64));
  });

  it('yields empty results for a body that is not an error document', () => {
    expect(parseErrorBody('<html>502 Bad Gateway</html>')).toEqual({ code: undefined, message: undefined });
    expect(parseErrorBody('')).toEqual({ code: undefined, message: undefined });
  });
});

describe('parseListObjectsV2', () => {
  it('reads keys, sizes, truncation and the continuation token', () => {
    const page = parseListObjectsV2(
      '<ListBucketResult><IsTruncated>true</IsTruncated>'
      + '<Contents><Key>packs/a&amp;b</Key><Size>10</Size></Contents><Contents><Key>packs/c</Key><Size>0</Size></Contents>'
      + '<NextContinuationToken>tok==</NextContinuationToken></ListBucketResult>',
    );
    expect(page).toEqual({ objects: [{ key: 'packs/a&b', size: 10 }, { key: 'packs/c', size: 0 }], truncated: true, nextToken: 'tok==' });
  });

  it('is not truncated without the flag and skips malformed entries rather than guessing', () => {
    const page = parseListObjectsV2(
      '<ListBucketResult><IsTruncated>false</IsTruncated>'
      + '<Contents><Key>ok</Key><Size>5</Size></Contents>'
      + '<Contents><Key>nosize</Key></Contents><Contents><Key>neg</Key><Size>-1</Size></Contents>'
      + '<Contents><Key>nan</Key><Size>x</Size></Contents><Contents><Size>3</Size></Contents>'
      + '<Contents><Key>huge</Key><Size>99999999999999999999</Size></Contents></ListBucketResult>',
    );
    expect(page.objects).toEqual([{ key: 'ok', size: 5 }]);
    expect(page.truncated).toBe(false);
    expect(page.nextToken).toBeUndefined();
    expect(parseListObjectsV2('garbage')).toEqual({ objects: [], truncated: false, nextToken: undefined });
  });
});

describe('parseListMultipartUploads', () => {
  it('reads uploads, markers and truncation, dropping entries with an unusable date', () => {
    const page = parseListMultipartUploads(
      '<ListMultipartUploadsResult><IsTruncated>true</IsTruncated>'
      + '<NextKeyMarker>packs/b</NextKeyMarker><NextUploadIdMarker>u2</NextUploadIdMarker>'
      + '<Upload><Key>packs/a</Key><UploadId>u1</UploadId><Initiated>2026-10-27T12:00:00.000Z</Initiated></Upload>'
      + '<Upload><Key>packs/b</Key><UploadId>u2</UploadId><Initiated>2026-10-27T13:00:00Z</Initiated></Upload>'
      + '<Upload><Key>packs/c</Key><UploadId>u3</UploadId><Initiated>not a date</Initiated></Upload>'
      + '<Upload><Key>packs/d</Key><Initiated>2026-10-27T13:00:00Z</Initiated></Upload>'
      + '</ListMultipartUploadsResult>',
    );
    expect(page.uploads).toEqual([
      { key: 'packs/a', uploadId: 'u1', initiated: Date.parse('2026-10-27T12:00:00.000Z') },
      { key: 'packs/b', uploadId: 'u2', initiated: Date.parse('2026-10-27T13:00:00Z') },
    ]);
    expect(page.truncated).toBe(true);
    expect(page.nextKeyMarker).toBe('packs/b');
    expect(page.nextUploadIdMarker).toBe('u2');
  });
});

describe('completeMultipartXml', () => {
  it('lists the parts in the given order and escapes ETags', () => {
    expect(completeMultipartXml([{ partNumber: 1, etag: 'abc' }, { partNumber: 2, etag: '"q&"' }])).toBe(
      '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>abc</ETag></Part><Part><PartNumber>2</PartNumber><ETag>&quot;q&amp;&quot;</ETag></Part></CompleteMultipartUpload>',
    );
  });
});
