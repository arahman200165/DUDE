import fc from 'fast-check';
import { neverThrows } from '../../../testing/property-harness';
import { diffConfigFiles, type ConfigFormat } from './config-file-comparator-logic';

describe('diffConfigFiles properties', () => {
  it('never throws on arbitrary texts in each supported format', () => {
    const inputs = fc.tuple(fc.string({ maxLength: 200 }), fc.string({ maxLength: 200 }), fc.constantFrom<ConfigFormat>('env', 'ini', 'properties'));
    neverThrows(([before, after, format]: [string, string, ConfigFormat]) => diffConfigFiles(before, after, format), inputs, {
      assertShape: (result) => expect(typeof (result as ReturnType<typeof diffConfigFiles>).ok).toBe('boolean'),
    });
  });
});
