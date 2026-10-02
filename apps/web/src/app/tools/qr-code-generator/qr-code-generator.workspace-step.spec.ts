import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './qr-code-generator.workspace-step';

describe('qr-code-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips the text preset through snapshot and restore', () => {
    workspaceStep.restore({ text: 'https://example.com', preset: 'text', ecLevel: 'M' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state['text']).toBe('https://example.com');
    expect(snapshot?.state['preset']).toBe('text');
  });

  it('is not history-eligible (may carry a WiFi password or TOTP seed)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
