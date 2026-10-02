import { parseEnvRules, validateEnv } from "./env-validator-logic.js";

describe('parseEnvRules', () => {
  it('parses typed and optional rules', () => {
    expect(parseEnvRules('PORT:number\nDEBUG:boolean?\nNAME')).toEqual([
      { key: 'PORT', type: 'number', required: true },
      { key: 'DEBUG', type: 'boolean', required: false },
      { key: 'NAME', type: 'string', required: true },
    ]);
  });

  it('skips blank lines and comments', () => {
    expect(parseEnvRules('# comment\n\nPORT:number')).toEqual([{ key: 'PORT', type: 'number', required: true }]);
  });
});

describe('validateEnv', () => {
  it('reports no issues when all required variables are present and valid', () => {
    const issues = validateEnv('PORT=8080\nDEBUG=true\nNAME=app', 'PORT:number\nDEBUG:boolean?\nNAME');
    expect(issues).toEqual([]);
  });

  it('flags a missing required variable', () => {
    const issues = validateEnv('PORT=8080', 'PORT:number\nNAME');
    expect(issues).toEqual([{ key: 'NAME', message: 'Missing required variable.' }]);
  });

  it('does not flag a missing optional variable', () => {
    const issues = validateEnv('', 'DEBUG:boolean?');
    expect(issues).toEqual([]);
  });

  it('flags a malformed number', () => {
    const issues = validateEnv('PORT=notanumber', 'PORT:number');
    expect(issues).toEqual([{ key: 'PORT', message: 'Value "notanumber" is not a valid number.' }]);
  });

  it('flags a malformed url', () => {
    const issues = validateEnv('API_URL=not a url', 'API_URL:url');
    expect(issues.some((issue) => issue.key === 'API_URL')).toBe(true);
  });

  it('accepts a valid url', () => {
    const issues = validateEnv('API_URL=https://example.com/api', 'API_URL:url');
    expect(issues).toEqual([]);
  });
});
