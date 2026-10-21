import { describe, expect, it } from 'vitest';
import { applyOctal, applySymbolic, initialChmodState, readChmodState, toggleBit, toggleSpecial } from './chmod-converter-mobile';

describe('chmod state', () => {
  it('starts at 755 / rwxr-xr-x', () => {
    expect(initialChmodState()).toMatchObject({ octal: '755', symbolic: 'rwxr-xr-x' });
  });
  it('octal drives symbolic (vector from chmod-convert.spec.ts: 754 -> rwxr-xr--)', () => {
    expect(applyOctal(initialChmodState(), '754')).toMatchObject({ octal: '754', symbolic: 'rwxr-xr--', octalError: '' });
  });
  it('symbolic drives octal (rwxr-xr-- -> 754)', () => {
    expect(applySymbolic(initialChmodState(), 'rwxr-xr--')).toMatchObject({ octal: '754', symbolic: 'rwxr-xr--' });
  });
  it('keeps the last valid permissions while a field holds invalid text', () => {
    const state = applyOctal(initialChmodState(), '999');
    expect(state.octalError).not.toBe('');
    expect(state.permissions).toEqual(initialChmodState().permissions);
    expect(state.symbolic).toBe('rwxr-xr-x');
  });
  it('toggling a grid cell updates both fields', () => {
    expect(toggleBit(applyOctal(initialChmodState(), '754'), 'other', 'write')).toMatchObject({ octal: '756', symbolic: 'rwxr-xrw-' });
  });
  it('setuid gives 4 digits (vector from chmod-convert.spec.ts: 4755 -> rwsr-xr-x)', () => {
    expect(toggleSpecial(initialChmodState(), 'setuid')).toMatchObject({ octal: '4755', symbolic: 'rwsr-xr-x' });
  });
  it('falls back to the default for unreadable stored state', () => {
    expect(readChmodState({ octal: 4 })).toEqual(initialChmodState());
    const state = applyOctal(initialChmodState(), '600');
    expect(readChmodState(state)).toBe(state);
  });
});
