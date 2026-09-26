import fc from 'fast-check';
import { neverThrows } from '../../../testing/property-harness';
import { mergeConfigSources, type ConfigSource, type ConfigSourceFormat } from './config-merge-tool-logic';

describe('mergeConfigSources properties', () => {
  it('never throws for generated source lists and returns a tagged result', () => {
    const formats: ConfigSourceFormat[] = ['env', 'ini', 'properties', 'yaml', 'json'];
    const sources: fc.Arbitrary<ConfigSource[]> = fc.array(fc.record({ format: fc.constantFrom(...formats), text: fc.string({ maxLength: 120 }) }), { maxLength: 5 });
    neverThrows(mergeConfigSources, sources, { assertShape: (result) => expect(typeof (result as ReturnType<typeof mergeConfigSources>).ok).toBe('boolean') });
  });
});
