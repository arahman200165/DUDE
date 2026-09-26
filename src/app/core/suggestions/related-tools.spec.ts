import { describe, expect, it } from 'vitest';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { DudeDataType } from '../../shared/models/tool-io.model';
import { relatedTools } from './related-tools';

function makeTool(id: string, accepts: readonly DudeDataType[], produces: readonly DudeDataType[]): ToolDefinition {
  return {
    id,
    title: id,
    description: id,
    category: 'developer',
    keywords: [],
    route: `/tools/${id}`,
    load: () => Promise.resolve(),
    io: { accepts, produces },
  };
}

describe('relatedTools', () => {
  const current = makeTool('base64', ['text'], ['text']);
  const jsonTool = makeTool('json', ['text', 'json'], ['text', 'json']);
  const hash = makeTool('hash', ['text'], ['text']);
  const unrelated = makeTool('qr-code-scanner', ['bytes'], ['bytes']);
  const all = [current, jsonTool, hash, unrelated];

  it('only includes tools current can actually feed', () => {
    const result = relatedTools(current, all, new Set(), () => 0, 10);
    const ids = result.map((t) => t.id);
    expect(ids).toContain('json');
    expect(ids).toContain('hash');
    expect(ids).not.toContain('qr-code-scanner');
    expect(ids).not.toContain('base64');
  });

  it('boosts candidates where both tools are pipeline-eligible', () => {
    const eligible = new Set(['base64', 'hash']);
    const result = relatedTools(current, all, eligible, () => 0, 10);
    expect(result[0].id).toBe('hash');
  });

  it('uses usage frequency as a tiebreaker within the same eligibility tier', () => {
    const frequency = (id: string) => (id === 'json' ? 5 : 1);
    const result = relatedTools(current, all, new Set(), frequency, 10);
    expect(result[0].id).toBe('json');
  });

  it('falls back to title order for full determinism', () => {
    const result = relatedTools(current, all, new Set(), () => 0, 10);
    expect(result.map((t) => t.id)).toEqual(['hash', 'json']);
  });

  it('respects the limit', () => {
    const result = relatedTools(current, all, new Set(), () => 0, 1);
    expect(result).toHaveLength(1);
  });
});
