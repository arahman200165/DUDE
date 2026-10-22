import { describe, expect, it } from 'vitest';
import { TOOL_METADATA } from '@dude/tool-registry';
import { detectShapes } from '@dude/tool-engine/core/paste-detect/paste-detect';
import { PASTE_DETECTORS } from '@dude/tool-engine/core/paste-detect/paste-detectors';
import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';
import { DEFAULT_FILE_INPUT_BYTES } from '../kit/file-io-core';
import {
  classifyShare, eligibleToolIds, IMAGE_SHARE_TOOL_IDS, imageExtension, planShare, shareReadCap, sharePreview, shouldRedactPreview, suggestShareTools,
} from './share-model';
import { ShareStore } from './share-store';

const TOOLS = new Map(TOOL_METADATA.map(tool => [tool.id, tool as ToolMetadata]));
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
const RUNNABLE = ['jwt', 'json', 'base64', 'diff', 'regex', 'qr-code-scanner', 'barcode-reader', 'device-info', 'uuid'];
const text = (value: string) => classifyShare({ kind: 'text', text: value });

describe('classifyShare', () => {
  it('classifies text, text files, images, binaries and oversize content', () => {
    expect(text('hello')).toMatchObject({ category: 'text', text: 'hello' });
    expect(classifyShare({ kind: 'file', name: 'a.json', mimeType: 'application/json', size: 2, text: '{}' })).toMatchObject({ category: 'text', label: 'a.json' });
    expect(classifyShare({ kind: 'file', name: 'a.png', mimeType: 'image/png', size: 3, base64: 'AAAA' })).toMatchObject({ category: 'image' });
    expect(classifyShare({ kind: 'file', name: 'a.bin', mimeType: 'application/octet-stream', size: 3, base64: 'AAAA' })).toMatchObject({ category: 'unsupported' });
    expect(classifyShare({ kind: 'file', name: 'big.txt', mimeType: 'text/plain', size: 9_000_000, tooLarge: true })).toMatchObject({ category: 'unsupported' });
    expect(classifyShare({ kind: 'text', text: '', size: 9_000_000, tooLarge: true })).toMatchObject({ category: 'unsupported' });
  });
});

describe('suggestions', () => {
  it('suggests the JWT Debugger first and only tools that run on Android', () => {
    const ids = RUNNABLE.filter(id => TOOLS.has(id));
    const suggestions = suggestShareTools(JWT, detectShapes, PASTE_DETECTORS, TOOLS, eligibleToolIds(text(JWT), ids));
    expect(suggestions[0]?.toolId).toBe('jwt');
    expect(suggestions[0]?.reason).toContain('% match');
    expect(suggestions.length).toBeLessThanOrEqual(4);
    for (const suggestion of suggestions) expect(ids).toContain(suggestion.toolId);
  });
  it('hides detector matches whose tool is not runnable, before ranking', () => {
    expect(suggestShareTools(JWT, detectShapes, PASTE_DETECTORS, TOOLS, ['base64'])).not.toContainEqual(expect.objectContaining({ toolId: 'jwt' }));
  });
});

describe('routing', () => {
  it('offers only the scanners for an image', () => {
    const image = classifyShare({ kind: 'file', name: 'a.png', mimeType: 'image/png', size: 3, base64: 'AAAA' });
    expect(eligibleToolIds(image, RUNNABLE)).toEqual(['qr-code-scanner', 'barcode-reader']);
    expect(eligibleToolIds(image, ['json'])).toEqual([]);
    expect(planShare(image, 'json', RUNNABLE, [])).toMatchObject({ ok: false });
    expect(planShare(image, 'qr-code-scanner', RUNNABLE, [])).toMatchObject({ ok: true, image: { base64: 'AAAA', mimeType: 'image/png' } });
  });
  it('keeps scanners and input-less tools out of the text list', () => {
    const ids = eligibleToolIds(text('x'), RUNNABLE);
    for (const id of [...IMAGE_SHARE_TOOL_IDS, 'device-info']) expect(ids).not.toContain(id);
    expect(ids).toContain('json');
  });
  it('prefills the tool input key and never runs anything', () => {
    expect(planShare(text('abc'), 'json', RUNNABLE, [])).toEqual({ ok: true, toolId: 'json', prefill: { input: 'abc' } });
    expect(planShare(text('abc'), 'diff', RUNNABLE, [])).toMatchObject({ ok: true, prefill: { left: 'abc' } });
    expect(planShare(text('abc'), 'regex', RUNNABLE, [])).toMatchObject({ ok: true, prefill: { testText: 'abc' } });
    expect(planShare(text('abc'), 'not-runnable', RUNNABLE, [])).toMatchObject({ ok: false });
  });
  it('rejects content over the target tool fileInput cap, and unsupported payloads', () => {
    const metadata = [{ id: 'json', fileInput: { extensions: ['.json'], maxBytes: 10 } }];
    const big = classifyShare({ kind: 'file', name: 'a.json', mimeType: 'application/json', size: 11, text: '12345678901' });
    expect(planShare(big, 'json', RUNNABLE, metadata)).toMatchObject({ ok: false, reason: expect.stringContaining('limit') });
    expect(planShare(big, 'base64', RUNNABLE, metadata)).toMatchObject({ ok: true });
    expect(planShare(classifyShare({ kind: 'file', name: 'x', mimeType: 'application/zip', size: 1, base64: 'AA' }), 'json', RUNNABLE, [])).toMatchObject({ ok: false });
  });
  it('reads up to the largest runnable fileInput cap but never less than 2 MiB', () => {
    expect(shareReadCap(['json'], [])).toBe(DEFAULT_FILE_INPUT_BYTES);
    expect(shareReadCap(['json', 'big'], [{ id: 'big', fileInput: { extensions: [], maxBytes: 5_000_000 } }])).toBe(5_000_000);
  });
  it('names a cache extension for shared images', () => {
    expect(imageExtension('image/jpeg')).toBe('jpg');
    expect(imageExtension('image/png; charset=x')).toBe('png');
    expect(imageExtension('image/weird')).toBe('img');
  });
});

describe('redaction', () => {
  it('hides previews of secret-like shapes and credentials, not ordinary text', () => {
    const matches = detectShapes(JWT, PASTE_DETECTORS, id => TOOLS.get(id)).map(match => match.toolId);
    expect(shouldRedactPreview(JWT, matches)).toBe(true);
    expect(shouldRedactPreview('-----BEGIN RSA PRIVATE KEY-----\nabc', [])).toBe(true);
    expect(shouldRedactPreview('Bearer abcdefghijklmnop1234', [])).toBe(true);
    expect(shouldRedactPreview('API_KEY=abc\nTOKEN=def', ['env-editor'])).toBe(true);
    expect(shouldRedactPreview('hello world', ['base64'])).toBe(false);
    expect(sharePreview(JWT, true)).not.toContain('eyJ');
    expect(sharePreview('a\n\n b  c', false)).toBe('a b c');
    expect(sharePreview('x'.repeat(500), false).length).toBeLessThan(200);
  });
});

describe('ShareStore', () => {
  it('holds one share in memory, notifies, and wipes', () => {
    const store = new ShareStore();
    let calls = 0;
    store.subscribe(() => { calls += 1; });
    store.set({ share: { kind: 'text', text: 'x' } });
    expect(store.get()).toEqual({ share: { kind: 'text', text: 'x' } });
    store.clearAll();
    expect(store.get()).toBeNull();
    store.clear();
    expect(calls).toBe(2);
  });
});
