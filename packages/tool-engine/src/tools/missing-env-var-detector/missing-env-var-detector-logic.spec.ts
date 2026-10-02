import { extractReferencedVars, findMissingEnvVars } from "./missing-env-var-detector-logic.js";

describe('extractReferencedVars', () => {
  it('extracts process.env dot and bracket references', () => {
    expect(extractReferencedVars("process.env.FOO; process.env['BAR']")).toEqual(['BAR', 'FOO']);
  });

  it('extracts os.environ references', () => {
    expect(extractReferencedVars("os.environ['FOO']\nos.environ.get('BAR')")).toEqual(['BAR', 'FOO']);
  });

  it('extracts shell-style ${VAR} and $VAR references', () => {
    expect(extractReferencedVars('echo ${FOO} and $BAR')).toEqual(['BAR', 'FOO']);
  });

  it('does not treat a shell positional parameter as a variable name', () => {
    expect(extractReferencedVars('echo $1')).toEqual([]);
  });

  it('deduplicates repeated references', () => {
    expect(extractReferencedVars('process.env.FOO; process.env.FOO')).toEqual(['FOO']);
  });

  it('returns an empty list for text with no references', () => {
    expect(extractReferencedVars('just plain text')).toEqual([]);
  });
});

describe('findMissingEnvVars', () => {
  it('reports variables referenced but not declared', () => {
    const report = findMissingEnvVars('process.env.FOO', '');
    expect(report.referencedButNotDeclared).toEqual(['FOO']);
  });

  it('reports variables declared but not referenced', () => {
    const report = findMissingEnvVars('', 'FOO=bar');
    expect(report.declaredButNotReferenced).toEqual(['FOO']);
  });

  it('reports no gaps when everything matches', () => {
    const report = findMissingEnvVars('process.env.FOO', 'FOO=bar');
    expect(report).toEqual({ referencedButNotDeclared: [], declaredButNotReferenced: [] });
  });
});
