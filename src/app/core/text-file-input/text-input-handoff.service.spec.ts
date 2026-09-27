import { afterEach, describe, expect, it } from 'vitest';
import { TextInputHandoffService } from './text-input-handoff.service';
import { readStorageValue } from '../workspace/workspace-storage-bridge';
import { textFileInputOf } from './imported-file-flags';
import type { ToolDefinition } from '../../shared/models/tool-definition.model';

const tool = (overrides: Partial<ToolDefinition>): ToolDefinition =>
  ({ id: 'probe-tool', title: 'Probe', io: { accepts: ['text'], produces: ['text'] }, ...overrides }) as ToolDefinition;

describe('TextInputHandoffService', () => {
  afterEach(() => sessionStorage.clear());

  it("writes the text into the tool's declared input key before navigation", () => {
    const service = new TextInputHandoffService();
    expect(service.offer(tool({ fileInput: { key: 'source', extensions: ['.md'] } }), '# Hi', 'notes.md')).toBe(true);
    expect(readStorageValue('probe-tool', 'source', 'session')).toBe('# Hi');
  });

  it('refuses a tool with no text input', () => {
    expect(new TextInputHandoffService().offer(tool({}), 'x')).toBe(false);
  });

  it('hands the file name out once, and only for the exact text that was handed off', () => {
    const service = new TextInputHandoffService();
    service.offer(tool({ fileInput: { key: 'source', extensions: ['.md'] } }), '# Hi', 'notes.md');
    expect(service.has('probe-tool')).toBe(true);
    expect(service.takeFileName('probe-tool', 'edited')).toBeUndefined();
    expect(service.takeFileName('probe-tool', '# Hi')).toBe('notes.md');
    expect(service.takeFileName('probe-tool', '# Hi')).toBeUndefined();
    expect(service.has('probe-tool')).toBe(false);
  });

  it('marks imported HTML so HTML Preview asks before running it', () => {
    new TextInputHandoffService().offer(tool({ fileInput: { key: 'source', extensions: ['.html'] } }), '<p>', 'page.html');
    expect(sessionStorage.getItem('dude:desktop:html-preview-manual')).toBe('true');
  });
});

describe('textFileInputOf', () => {
  it('falls back to a desktopOpen input key and extensions', () => {
    expect(textFileInputOf(tool({ desktopOpen: { extensions: ['.json'], inputKey: 'input' } }))).toEqual({ key: 'input', extensions: ['.json'] });
    expect(textFileInputOf(tool({ desktopOpen: { directory: true } }))).toBeUndefined();
  });

  it('prefers an explicit fileInput', () => {
    const fileInput = { key: 'source', extensions: ['.md', '.markdown'] };
    expect(textFileInputOf(tool({ fileInput, desktopOpen: { extensions: ['.md'], inputKey: 'other' } }))).toBe(fileInput);
  });
});
