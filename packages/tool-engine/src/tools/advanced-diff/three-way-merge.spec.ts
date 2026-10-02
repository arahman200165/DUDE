import { buildThreeWayMergeOutput, computeThreeWayMerge } from "./three-way-merge.js";

const NO_DECISIONS = new Map();

describe('computeThreeWayMerge / buildThreeWayMergeOutput', () => {
  it('produces no hunks and passes base through unchanged when nothing changed', () => {
    const base = 'a\nb\nc';
    const { hunks } = computeThreeWayMerge(base, base, base);
    expect(hunks.every((h) => h.context)).toBe(true);
    expect(buildThreeWayMergeOutput(hunks, NO_DECISIONS)).toBe(base);
  });

  it('auto-resolves a change made only on the left', () => {
    const base = 'a\nb\nc';
    const left = 'a\nX\nc';
    const right = 'a\nb\nc';
    const { hunks } = computeThreeWayMerge(base, left, right);

    const realHunks = hunks.filter((h) => !h.context);
    expect(realHunks).toHaveLength(1);
    expect(realHunks[0].status).toBe('left-only');
    expect(buildThreeWayMergeOutput(hunks, NO_DECISIONS)).toBe(left);
  });

  it('auto-resolves a change made only on the right', () => {
    const base = 'a\nb\nc';
    const left = 'a\nb\nc';
    const right = 'a\nZ\nc';
    const { hunks } = computeThreeWayMerge(base, left, right);

    const realHunks = hunks.filter((h) => !h.context);
    expect(realHunks).toHaveLength(1);
    expect(realHunks[0].status).toBe('right-only');
    expect(buildThreeWayMergeOutput(hunks, NO_DECISIONS)).toBe(right);
  });

  it('auto-resolves when both sides converge on the same change', () => {
    const base = 'a\nb\nc';
    const left = 'a\nY\nc';
    const right = 'a\nY\nc';
    const { hunks } = computeThreeWayMerge(base, left, right);

    const realHunks = hunks.filter((h) => !h.context);
    expect(realHunks).toHaveLength(1);
    expect(realHunks[0].status).toBe('both-same');
    expect(buildThreeWayMergeOutput(hunks, NO_DECISIONS)).toBe(left);
  });

  it('flags a genuine conflict when both sides change the same line differently', () => {
    const base = 'a\nb\nc';
    const left = 'a\nX\nc';
    const right = 'a\nZ\nc';
    const { hunks } = computeThreeWayMerge(base, left, right);

    const realHunks = hunks.filter((h) => !h.context);
    expect(realHunks).toHaveLength(1);
    expect(realHunks[0].status).toBe('conflict');

    const unresolved = buildThreeWayMergeOutput(hunks, NO_DECISIONS);
    expect(unresolved).toContain('<<<<<<< left');
    expect(unresolved).toContain('X');
    expect(unresolved).toContain('||||||| base');
    expect(unresolved).toContain('b');
    expect(unresolved).toContain('=======');
    expect(unresolved).toContain('Z');
    expect(unresolved).toContain('>>>>>>> right');

    const decisions = new Map([[realHunks[0].index, 'left' as const]]);
    expect(buildThreeWayMergeOutput(hunks, decisions)).toBe(left);
  });

  it('resolves a conflict to the base version when explicitly chosen', () => {
    const base = 'a\nb\nc';
    const left = 'a\nX\nc';
    const right = 'a\nZ\nc';
    const { hunks } = computeThreeWayMerge(base, left, right);
    const realHunks = hunks.filter((h) => !h.context);

    const decisions = new Map([[realHunks[0].index, 'base' as const]]);
    expect(buildThreeWayMergeOutput(hunks, decisions)).toBe(base);
  });

  it('handles an insertion made only on the left', () => {
    const base = 'a\nb';
    const left = 'a\nINSERTED\nb';
    const right = 'a\nb';
    const { hunks } = computeThreeWayMerge(base, left, right);

    const realHunks = hunks.filter((h) => !h.context);
    expect(realHunks.some((h) => h.status === 'left-only' && h.leftLines.includes('INSERTED'))).toBe(true);
    expect(buildThreeWayMergeOutput(hunks, NO_DECISIONS)).toBe(left);
  });

  it('agrees when both sides delete the same base line', () => {
    const base = 'a\nb\nc';
    const left = 'a\nc';
    const right = 'a\nc';
    const { hunks } = computeThreeWayMerge(base, left, right);

    const realHunks = hunks.filter((h) => !h.context);
    expect(realHunks).toHaveLength(1);
    expect(realHunks[0].status).toBe('both-same');
    expect(buildThreeWayMergeOutput(hunks, NO_DECISIONS)).toBe(left);
  });
});
