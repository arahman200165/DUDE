import { buildMultipartBody, contentTypeHeader, generateBoundary } from "./multipart-build.js";

describe('generateBoundary', () => {
  it('prefixes the given random hex with a stable identifier', () => {
    expect(generateBoundary('abc123')).toBe('----DUDEFormBoundaryabc123');
  });
});

describe('contentTypeHeader', () => {
  it('builds the Content-Type header with the boundary parameter', () => {
    expect(contentTypeHeader('----DUDEFormBoundaryabc123')).toBe('multipart/form-data; boundary=----DUDEFormBoundaryabc123');
  });
});

describe('buildMultipartBody', () => {
  it('builds a body with a text field and a closing boundary', () => {
    const result = buildMultipartBody([{ kind: 'text', key: 'name', value: 'Ada' }], 'BOUNDARY');
    expect(result).toBe('--BOUNDARY\r\nContent-Disposition: form-data; name="name"\r\n\r\nAda\r\n--BOUNDARY--');
  });

  it('builds a body with a file field, showing a binary-data placeholder', () => {
    const result = buildMultipartBody(
      [{ kind: 'file', key: 'photo', filename: 'a.png', contentType: 'image/png', size: 1234 }],
      'BOUNDARY',
    );
    expect(result).toBe(
      '--BOUNDARY\r\nContent-Disposition: form-data; name="photo"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n<binary data: 1234 bytes>\r\n--BOUNDARY--',
    );
  });

  it('defaults an empty content type to application/octet-stream', () => {
    const result = buildMultipartBody([{ kind: 'file', key: 'f', filename: 'x', contentType: '', size: 1 }], 'B');
    expect(result).toContain('Content-Type: application/octet-stream');
  });

  it('combines multiple fields and skips one with an empty key', () => {
    const result = buildMultipartBody(
      [
        { kind: 'text', key: 'a', value: '1' },
        { kind: 'text', key: '', value: 'ignored' },
        { kind: 'text', key: 'b', value: '2' },
      ],
      'B',
    );
    expect(result).toBe('--B\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--B\r\nContent-Disposition: form-data; name="b"\r\n\r\n2\r\n--B--');
  });

  it('produces just the closing boundary for no fields', () => {
    expect(buildMultipartBody([], 'B')).toBe('--B--');
  });
});
