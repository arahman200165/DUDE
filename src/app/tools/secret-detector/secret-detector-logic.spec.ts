import fc from 'fast-check';
import { detectSecrets, redactMatch } from './secret-detector-logic';

describe('detectSecrets', () => {
  it('detects an AWS access key id', () => {
    const findings = detectSecrets('key = AKIAIOSFODNN7EXAMPLE');
    expect(findings.some((f) => f.kind === 'AWS Access Key ID' && f.match === 'AKIAIOSFODNN7EXAMPLE')).toBe(true);
  });

  it('detects a GitHub personal access token', () => {
    const token = `ghp_${'a'.repeat(36)}`;
    const findings = detectSecrets(token);
    expect(findings.some((f) => f.kind === 'GitHub Token' && f.match === token)).toBe(true);
  });

  it('detects a PEM private key header', () => {
    const findings = detectSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIB...');
    expect(findings.some((f) => f.kind === 'Private Key')).toBe(true);
  });

  it('detects a JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const findings = detectSecrets(jwt);
    expect(findings.some((f) => f.kind === 'JWT' && f.match === jwt)).toBe(true);
  });

  it('detects a generic "key = value" secret assignment', () => {
    const findings = detectSecrets('DB_PASSWORD=SuperSecretValue123');
    expect(findings.some((f) => f.kind === 'Generic API key assignment')).toBe(true);
  });

  it('flags an otherwise-unrecognized high-entropy token', () => {
    const findings = detectSecrets('random blob: aB3xK9mZ2pQ7rL4vN8tE9wY');
    expect(findings.some((f) => f.kind === 'High-entropy string')).toBe(true);
  });

  it('does not double-report a token already matched by a specific pattern', () => {
    const token = `ghp_${'a'.repeat(36)}`;
    const findings = detectSecrets(token);
    expect(findings).toHaveLength(1);
  });

  it('returns no findings for ordinary text', () => {
    expect(detectSecrets('hello world, this is just some plain text.')).toEqual([]);
  });

  it('sorts findings by position in the text', () => {
    const text = `first: AKIAIOSFODNN7EXAMPLE, second: ghp_${'b'.repeat(36)}`;
    const findings = detectSecrets(text);
    expect(findings[0].kind).toBe('AWS Access Key ID');
    expect(findings[1].kind).toBe('GitHub Token');
  });
});

describe('redactMatch', () => {
  it('masks a short value entirely', () => {
    expect(redactMatch('abc')).toBe('•••');
  });

  it('shows a prefix/suffix for a longer value', () => {
    expect(redactMatch('AKIAIOSFODNN7EXAMPLE')).toBe('AKIA…MPLE');
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  it('never throws and completes quickly for arbitrary text, guarding against regex catastrophic backtracking', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), (text) => {
        const start = performance.now();
        expect(() => detectSecrets(text)).not.toThrow();
        expect(performance.now() - start).toBeLessThan(500);
      }),
    );
  });
});
