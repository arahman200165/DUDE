import { timeSample } from "./regex-benchmark-run.js";

describe('timeSample', () => {
  it('times a matching sample and reports matched: true', () => {
    const result = timeSample({ pattern: 'ban+a', flags: '', sample: 'banana' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.matched).toBe(true);
    expect(result.ok && result.ms).toBeGreaterThanOrEqual(0);
  });

  it('times a non-matching sample and reports matched: false', () => {
    const result = timeSample({ pattern: '^xyz$', flags: '', sample: 'banana' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.matched).toBe(false);
  });

  it('errors for an invalid pattern rather than throwing', () => {
    const result = timeSample({ pattern: '(', flags: '', sample: 'x' });
    expect(result.ok).toBe(false);
  });
});
