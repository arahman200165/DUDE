import { detectFileType } from "@dude/tool-engine/tools/file-type-detector/file-type-detector-logic";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe('detectFileType', () => {
  it('reports a clean PNG with no extension mismatch', () => {
    const report = detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0), 'photo.png', 'image/png');
    expect(report.detected?.mime).toBe('image/png');
    expect(report.extensionMismatch).toBe(false);
    expect(report.containerFormat).toBeNull();
  });

  it('flags an extension mismatch when the declared extension does not match the signature', () => {
    const report = detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'photo.txt', null);
    expect(report.extensionMismatch).toBe(true);
  });

  it('treats jpg/jpeg as equivalent extensions', () => {
    const report = detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0), 'photo.jpeg', 'image/jpeg');
    expect(report.extensionMismatch).toBe(false);
  });

  it('disambiguates a docx from the generic ZIP signature via its internal document.xml path', () => {
    const raw = 'PK\u0003\u0004garbageword/document.xmlmore garbage';
    const zipBytes = new Uint8Array(Array.from(raw, (c) => c.charCodeAt(0)));
    const report = detectFileType(zipBytes, 'report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(report.containerFormat).toBe('docx');
    expect(report.extensionMismatch).toBe(false);
  });

  it('flags a mismatch when a ZIP container is disambiguated to something other than the declared extension', () => {
    const raw = 'PK\u0003\u0004xl/workbook.xml';
    const zipBytes = new Uint8Array(Array.from(raw, (c) => c.charCodeAt(0)));
    const report = detectFileType(zipBytes, 'workbook.docx', null);
    expect(report.containerFormat).toBe('xlsx');
    expect(report.extensionMismatch).toBe(true);
  });

  it('does not flag a mismatch when no signature was detected at all', () => {
    const report = detectFileType(new TextEncoder().encode('plain text'), 'notes.xyz', null);
    expect(report.detected).toBeNull();
    expect(report.extensionMismatch).toBe(false);
  });

  it('formats the matched-bytes hex preview as space-separated byte pairs', () => {
    const report = detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0), 'photo.jpg', null);
    expect(report.matchedBytesHex).toBe('ff d8 ff e0');
  });

  it('caps the matched-bytes hex preview at 16 bytes', () => {
    const long = new Uint8Array(32).fill(0xab);
    const report = detectFileType(long, 'file.bin', null);
    expect(report.matchedBytesHex.split(' ')).toHaveLength(16);
  });
});
