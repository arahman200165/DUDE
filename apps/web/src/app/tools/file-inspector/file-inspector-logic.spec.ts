import { inspectFile } from "@dude/tool-engine/tools/file-inspector/file-inspector-logic";

describe('inspectFile', () => {
  it('reports the detected signature and a low entropy verdict for a plain PNG-ish buffer', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(100).fill(0)]);
    const report = inspectFile(bytes, 'photo.png', 'image/png');

    expect(report.fileName).toBe('photo.png');
    expect(report.fileSize).toBe(bytes.length);
    expect(report.detectedSignature?.mime).toBe('image/png');
    expect(report.containerFormat).toBeNull();
    expect(report.entropyVerdict).toBe('low');
  });

  it('resolves a ZIP container to its disambiguated format', () => {
    const raw = 'PK\u0003\u0004garbageword/document.xml';
    const bytes = new Uint8Array(Array.from(raw, (c) => c.charCodeAt(0)));
    const report = inspectFile(bytes, 'report.docx', null);
    expect(report.containerFormat).toBe('docx');
  });

  it('reports a high entropy verdict for maximally varied bytes', () => {
    const bytes = new Uint8Array(4096);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(inspectFile(bytes, 'blob.bin', null).entropyVerdict).toBe('high');
  });

  it('samples up to 10 extracted strings at least 4 characters long', () => {
    const text = new TextEncoder().encode('\u0000hello\u0000world\u0000foobar\u0000');
    const report = inspectFile(text, 'notes.bin', null);
    expect(report.sampleStrings).toEqual(['hello', 'world', 'foobar']);
  });

  it('returns null detected signature for unrecognized content', () => {
    const report = inspectFile(new TextEncoder().encode('just plain text'), 'file.txt', 'text/plain');
    expect(report.detectedSignature).toBeNull();
  });
});
