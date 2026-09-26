import { describe, expect, it } from 'vitest';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { FileDropContext, FileDropDetector } from './file-drop-detectors.model';
import { buildFileDropContext, rankFileDropCandidates } from './file-drop-detect';

function makeTool(id: string, desktopOpen?: ToolDefinition['desktopOpen']): ToolDefinition {
  return {
    id,
    title: id,
    description: '',
    category: 'developer',
    keywords: [],
    route: `/tools/${id}`,
    load: () => Promise.resolve(),
    io: { accepts: ['file'], produces: ['text'] },
    desktopOpen,
  };
}

function context(overrides: Partial<FileDropContext> = {}): FileDropContext {
  return { fileName: 'file.bin', declaredMime: '', sniffed: null, containerFormat: null, ...overrides };
}

describe('rankFileDropCandidates', () => {
  const sqliteViewer = makeTool('sqlite-viewer');
  const jsonTool = makeTool('json', { extensions: ['.json'], inputKey: 'input' });
  const fileHash = makeTool('file-hash');
  const definitions = [sqliteViewer, jsonTool, fileHash];
  const getTool = (id: string) => definitions.find((t) => t.id === id);

  const sqliteDetector: FileDropDetector = { toolId: 'sqlite-viewer', test: (ctx) => (ctx.sniffed?.mime === 'application/vnd.sqlite3' ? 0.95 : null) };
  const hashDetector: FileDropDetector = { toolId: 'file-hash', test: () => 0.3 };

  it('ranks a magic-byte match above the universal fallback', () => {
    const ctx = context({ sniffed: { mime: 'application/vnd.sqlite3', extension: 'sqlite' } });
    const result = rankFileDropCandidates(ctx, definitions, [sqliteDetector, hashDetector], getTool);
    expect(result[0].toolId).toBe('sqlite-viewer');
    expect(result.map((m) => m.toolId)).toContain('file-hash');
  });

  it('matches a tool by its registered desktopOpen.extensions', () => {
    const ctx = context({ fileName: 'data.json' });
    const result = rankFileDropCandidates(ctx, definitions, [hashDetector], getTool);
    expect(result[0].toolId).toBe('json');
  });

  it('is case-insensitive about the extension', () => {
    const ctx = context({ fileName: 'DATA.JSON' });
    const result = rankFileDropCandidates(ctx, definitions, [], getTool);
    expect(result.map((m) => m.toolId)).toContain('json');
  });

  it('drops a detector match for a tool id not in the registry', () => {
    const ghost: FileDropDetector = { toolId: 'does-not-exist', test: () => 0.9 };
    const result = rankFileDropCandidates(context(), definitions, [ghost], getTool);
    expect(result.map((m) => m.toolId)).not.toContain('does-not-exist');
  });

  it('keeps the higher of two scores when both an extension and a detector match the same tool', () => {
    const weakDetector: FileDropDetector = { toolId: 'json', test: () => 0.1 };
    const ctx = context({ fileName: 'data.json' });
    const result = rankFileDropCandidates(ctx, definitions, [weakDetector], getTool);
    const jsonMatch = result.find((m) => m.toolId === 'json')!;
    expect(jsonMatch.score).toBe(0.85); // the extension match, not the weaker detector score
  });

  it('respects the file with no extension and no sniffed signature gracefully', () => {
    const result = rankFileDropCandidates(context({ fileName: 'noext' }), definitions, [hashDetector], getTool);
    expect(result[0].toolId).toBe('file-hash');
  });
});

describe('buildFileDropContext', () => {
  it('sniffs a real PNG signature from file bytes', async () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const file = new File([pngHeader], 'photo.png', { type: 'image/png' });

    const ctx = await buildFileDropContext(file);

    expect(ctx.fileName).toBe('photo.png');
    expect(ctx.sniffed?.mime).toBe('image/png');
  });

  it('returns a null signature for unrecognized bytes', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'mystery.bin');
    const ctx = await buildFileDropContext(file);
    expect(ctx.sniffed).toBeNull();
    expect(ctx.containerFormat).toBeNull();
  });
});
