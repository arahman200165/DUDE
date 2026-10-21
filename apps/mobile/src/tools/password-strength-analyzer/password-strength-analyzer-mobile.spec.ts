import { describe, expect, it } from 'vitest';
import { strengthView } from './password-strength-analyzer-mobile';

const row = (view: ReturnType<typeof strengthView>, key: string) => view?.rows.find(candidate => candidate.key === key)?.value;

describe('strengthView', () => {
  it('returns nothing for an empty password', () => {
    expect(strengthView('')).toBeNull();
  });
  it('rates a common password very weak and lists the penalty', () => {
    const view = strengthView('password');
    expect(view?.verdict).toBe('very-weak');
    expect(row(view, 'verdict')).toBe('Very weak');
    expect(row(view, 'charset')).toBe('26');
    expect(row(view, 'penalties')).toBe('Matches an extremely common password.');
  });
  it('rates a long random password strong with no penalties', () => {
    const view = strengthView('kx7qP2zR9mN5wT1vB8cL');
    expect(view?.verdict).toBe('strong');
    expect(row(view, 'entropy')).toBe('119.1 bits');
    expect(row(view, 'penalties')).toBe('None');
  });
});
