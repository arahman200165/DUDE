import { validateCompose } from "./docker-compose-validator-logic.js";

describe('validateCompose', () => {
  it('accepts a minimal valid compose file with no issues', () => {
    const result = validateCompose('services:\n  web:\n    image: nginx:1.27\n    ports:\n      - "8080:80"\n');
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('warns on a deprecated top-level version key', () => {
    const result = validateCompose('version: "3.8"\nservices:\n  web:\n    image: nginx:1.27\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues.some((issue) => issue.path === 'version')).toBe(true);
  });

  it('flags a missing services mapping', () => {
    const result = validateCompose('foo: bar\n');
    expect(result).toEqual({ ok: true, issues: [{ path: 'services', message: 'Missing or invalid "services" mapping.' }] });
  });

  it('flags a service with neither image nor build', () => {
    const result = validateCompose('services:\n  web:\n    ports:\n      - "8080:80"\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues.some((issue) => issue.message.includes('neither "image" nor "build"'))).toBe(true);
  });

  it('accepts a service defined with "build" instead of "image"', () => {
    const result = validateCompose('services:\n  web:\n    build: .\n');
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('flags a malformed port', () => {
    const result = validateCompose('services:\n  web:\n    image: nginx\n    ports:\n      - "notaport"\n');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.issues.some((issue) => issue.path === 'services.web.ports[0]')).toBe(true);
  });

  it('rejects a non-mapping top-level document', () => {
    expect(validateCompose('- a\n- b\n').ok).toBe(false);
  });

  it('rejects invalid YAML', () => {
    expect(validateCompose('services: [1, 2\n').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(validateCompose('').ok).toBe(false);
  });
});
