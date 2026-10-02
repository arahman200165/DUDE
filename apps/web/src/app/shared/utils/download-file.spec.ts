import { downloadFile } from './download-file';

describe('downloadFile', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('wraps raw bytes in a Blob with the given mime type and triggers a download', () => {
    downloadFile(new Uint8Array([1, 2, 3]), 'data.bin', 'application/octet-stream');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/octet-stream');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('uses a Blob passed in directly without re-wrapping it', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    downloadFile(blob, 'notes.txt');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('sets the anchor filename to the requested download name', () => {
    let capturedName: string | undefined;
    clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
      capturedName = this.download;
    });

    downloadFile(new Uint8Array([1]), 'report.json', 'application/json');

    expect(capturedName).toBe('report.json');
  });
});
