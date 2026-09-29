import { expandEnvStrings } from './env-expand';

describe('expandEnvStrings', () => {
  it('replaces names case-insensitively', () => {
    expect(expandEnvStrings('%userprofile%\\bin', { USERPROFILE: 'C:\\Users\\me' })).toBe('C:\\Users\\me\\bin');
  });
  it('leaves unknown references as-is', () => {
    expect(expandEnvStrings('%NOPE%;%A%', new Map([['a', '1']]))).toBe('%NOPE%;1');
  });
  it('does not recurse into substituted values', () => {
    expect(expandEnvStrings('%A%', { A: '%A%x', B: '%A%' })).toBe('%A%x');
    expect(expandEnvStrings('%B%', { A: '1', B: '%A%' })).toBe('%A%');
  });
  it('handles lone percent signs and empty input', () => {
    expect(expandEnvStrings('100%', {})).toBe('100%');
    expect(expandEnvStrings('', {})).toBe('');
  });
});
