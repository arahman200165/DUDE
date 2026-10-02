import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './schema-diff.workspace-step';

describe('schema-diff workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both sides through snapshot and restore', () => {
    workspaceStep.restore({ before: 'CREATE TABLE a (id INT)', after: 'CREATE TABLE a (id INT, name TEXT)', dialect: 'mysql' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ before: 'CREATE TABLE a (id INT)', after: 'CREATE TABLE a (id INT, name TEXT)', dialect: 'mysql' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
