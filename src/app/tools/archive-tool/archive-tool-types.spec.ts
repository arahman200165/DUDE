import { archiveFormatFromName } from './archive-tool-types';

describe('archiveFormatFromName', () => {
  it.each([
    ['bundle.zip', 'zip'],
    ['BACKUP.TAR', 'tar'],
    ['src.tar.gz', 'tar.gz'],
    ['src.tgz', 'tar.gz'],
  ])('infers %s -> %s', (name, format) => {
    expect(archiveFormatFromName(name)).toBe(format);
  });

  it('returns null for names it cannot infer', () => {
    expect(archiveFormatFromName('archive')).toBeNull();
    expect(archiveFormatFromName('data.7z')).toBeNull();
  });
});
