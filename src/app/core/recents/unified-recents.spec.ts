import { describe, expect, it } from 'vitest';
import { UnifiedRecentEntry } from './unified-recents.model';
import { mergeUnifiedRecents } from './unified-recents';

function tool(toolId: string, at: string): UnifiedRecentEntry {
  return { kind: 'tool', toolId, title: toolId, at };
}

function pipeline(pipelineId: string, at: string): UnifiedRecentEntry {
  return { kind: 'pipeline', pipelineId, title: pipelineId, at };
}

function historyEntry(entryId: string, toolId: string, at: string): UnifiedRecentEntry {
  return { kind: 'history', entryId, toolId, title: toolId, at };
}

describe('mergeUnifiedRecents', () => {
  it('merges and sorts entries from multiple sources, most recent first', () => {
    const result = mergeUnifiedRecents(
      [tool('base64', '2026-01-01T00:00:00.000Z')],
      [pipeline('p1', '2026-01-03T00:00:00.000Z')],
      [historyEntry('h1', 'json', '2026-01-02T00:00:00.000Z')],
    );

    expect(result.map((e) => e.kind)).toEqual(['pipeline', 'history', 'tool']);
  });

  it('keeps only the most recent instance of a repeated (kind, id) pair', () => {
    const result = mergeUnifiedRecents([
      tool('base64', '2026-01-01T00:00:00.000Z'),
      tool('base64', '2026-01-05T00:00:00.000Z'),
      tool('base64', '2026-01-03T00:00:00.000Z'),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].at).toBe('2026-01-05T00:00:00.000Z');
  });

  it('does not conflate the same tool id across different kinds', () => {
    const result = mergeUnifiedRecents(
      [tool('json', '2026-01-01T00:00:00.000Z')],
      [historyEntry('h1', 'json', '2026-01-02T00:00:00.000Z')],
    );

    expect(result).toHaveLength(2);
  });

  it('caps the result at 50 entries', () => {
    const many = Array.from({ length: 60 }, (_, i) => tool(`tool-${i}`, `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`));
    const result = mergeUnifiedRecents(many);
    expect(result).toHaveLength(50);
    // The 50 most recent (highest-index) entries survive.
    expect(result[0].kind === 'tool' && result[0].toolId).toBe('tool-59');
  });

  it('returns an empty array for no sources', () => {
    expect(mergeUnifiedRecents()).toEqual([]);
  });
});
