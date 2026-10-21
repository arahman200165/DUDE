import { describe, expect, it } from 'vitest';
import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';
import { partitionCatalog } from './catalog-partition';
import type { MobileBindingMap } from './mobile-binding';

const tool = (id: string, desktopOnly = false): ToolMetadata => ({
  id, title: id, description: id, category: 'text', keywords: [], route: '/tools/' + id, status: 'stable',
  persistence: { input: 'session', preferences: 'local' }, io: { accepts: ['text'], produces: ['text'] },
  ...(desktopOnly ? { capabilities: [{ kind: 'platform', web: 'unavailable', note: 'Reads the registry' }] } : {}),
} as unknown as ToolMetadata);
const load = async () => ({ default: () => null });
const tools = [tool('a'), tool('b', true), tool('c'), tool('d')];
const bindings: MobileBindingMap = { a: { load }, c: { load } };

describe('partitionCatalog', () => {
  it('lists runnable tools first in ranking order and hides the rest by default', () => {
    const result = partitionCatalog(tools, bindings, false);
    expect(result.entries.map(entry => entry.tool.id)).toEqual(['a', 'c']);
    expect(result.runnableCount).toBe(2);
    expect(result.desktopOnlyCount).toBe(2);
    expect(result.forcedAll).toBe(false);
  });
  it('appends non-runnable tools with their reason when shown', () => {
    const result = partitionCatalog(tools, bindings, true);
    expect(result.entries.map(entry => entry.tool.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(result.entries[2]?.reason).toContain('Requires desktop capabilities');
    expect(result.entries[3]?.reason).toBe('Mobile UI is not implemented for this tool.');
    expect(result.entries[0]?.reason).toBeUndefined();
  });
  it('shows the full list when nothing is runnable', () => {
    const result = partitionCatalog(tools, {}, false);
    expect(result.entries).toHaveLength(4);
    expect(result.forcedAll).toBe(true);
    expect(result.entries.every(entry => !entry.runnable && entry.reason)).toBe(true);
  });
  it('handles an empty list', () => expect(partitionCatalog([], bindings, false).entries).toEqual([]));
});
