import { FileDropHandoffService } from './file-drop-handoff.service';

describe('FileDropHandoffService', () => {
  it('returns undefined when nothing was offered', () => {
    const service = new FileDropHandoffService();
    expect(service.consume('file-hash')).toBeUndefined();
  });

  it('returns the offered file once, then undefined', () => {
    const service = new FileDropHandoffService();
    const file = new File(['hello'], 'hello.txt');

    service.offer('file-hash', file);

    expect(service.consume('file-hash')).toBe(file);
    expect(service.consume('file-hash')).toBeUndefined();
  });

  it('tracks offers per tool id independently', () => {
    const service = new FileDropHandoffService();
    const a = new File(['a'], 'a.txt');
    const b = new File(['b'], 'b.txt');

    service.offer('file-hash', a);
    service.offer('file-base64', b);

    expect(service.consume('file-base64')).toBe(b);
    expect(service.consume('file-hash')).toBe(a);
  });

  it('has() reports a pending offer without consuming it', () => {
    const service = new FileDropHandoffService();
    service.offer('archive-tool', new File(['a'], 'a.zip'));

    expect(service.has('archive-tool')).toBe(true);
    expect(service.has('archive-tool')).toBe(true);
    expect(service.consume('archive-tool')).toBeDefined();
    expect(service.has('archive-tool')).toBe(false);
  });
});
