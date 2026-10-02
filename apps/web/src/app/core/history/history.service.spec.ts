import 'fake-indexeddb/auto';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideBootSnapshot } from '../persistence/device-store/boot-snapshot';
import { fakeElectronBridge } from '../platform/testing/fake-electron-bridge';
import { HistoryService } from './history.service';
import { clearAllEntries } from './history-db';
import { MAX_ENTRIES_PER_TOOL, MAX_ENTRY_SIZE_BYTES } from "@dude/domain/core/history/history.model";

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(async () => {
    await clearAllEntries();
    TestBed.configureTestingModule({});
    service = TestBed.inject(HistoryService);
    await stable();
  });

  it('starts with an empty recent feed', () => {
    expect(service.recent()).toEqual([]);
  });

  it('records an entry and reflects it in the recent feed', async () => {
    await service.record('base64', 'Encoding "hi"', { input: 'hi' });

    expect(service.recent()).toHaveLength(1);
    expect(service.recent()[0].summary).toBe('Encoding "hi"');
    expect(service.recent()[0].toolId).toBe('base64');
  });

  it('retrieves an entry by id and lists by tool', async () => {
    await service.record('base64', 'first', { input: 'a' });
    await service.record('json', 'second', { input: 'b' });

    const [entry] = await service.listByTool('base64');
    expect(entry.summary).toBe('first');
    expect(await service.getById(entry.id)).toEqual(entry);
  });

  it('deletes a single entry', async () => {
    await service.record('base64', 'first', { input: 'a' });
    const [entry] = await service.listByTool('base64');

    await service.deleteOne(entry.id);

    expect(await service.getById(entry.id)).toBeUndefined();
    expect(service.recent()).toEqual([]);
  });

  it('clears one tool without touching others', async () => {
    await service.record('base64', 'a', {});
    await service.record('json', 'b', {});

    await service.clearTool('base64');

    expect(await service.listByTool('base64')).toEqual([]);
    expect(await service.listByTool('json')).toHaveLength(1);
  });

  it('clears everything', async () => {
    await service.record('base64', 'a', {});
    await service.record('json', 'b', {});

    await service.clearAll();

    expect(service.recent()).toEqual([]);
  });

  it('truncates an oversized snapshot rather than rejecting it', async () => {
    const huge = 'x'.repeat(MAX_ENTRY_SIZE_BYTES + 1000);
    await service.record('json', 'huge input', { input: huge });

    const [entry] = await service.listByTool('json');
    expect(entry.truncated).toBe(true);
    expect(JSON.stringify(entry.state).length).toBeLessThan(huge.length);
  });

  it('evicts the oldest entries once a tool exceeds its per-tool cap', async () => {
    for (let i = 0; i < MAX_ENTRIES_PER_TOOL + 5; i++) {
      await service.record('hash', `entry ${i}`, { i });
    }

    expect(await service.listByTool('hash', MAX_ENTRIES_PER_TOOL + 10)).toHaveLength(MAX_ENTRIES_PER_TOOL);
  }, 20000);

  it('starts with no error', () => {
    expect(service.lastError()).toBeNull();
  });
});

describe('HistoryService on the desktop device store', () => {
  afterEach(() => { delete (window as unknown as { dude?: unknown }).dude; });

  it('records, restores a stored entry by id and clears through the device repository', async () => {
    const bridge = fakeElectronBridge();
    Object.defineProperty(window, 'dude', { value: bridge, configurable: true, writable: true });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideBootSnapshot({ boot: await bridge.store.hydrate() })] });
    const service = TestBed.inject(HistoryService);

    await service.record('base64', 'Encoding "hi"', { input: 'hi' });

    expect(await bridge.store.history.list()).toHaveLength(1);
    expect(service.recent()[0].summary).toBe('Encoding "hi"');
    // Restoring only reads the stored state back; nothing here can run a tool.
    expect((await service.getById(service.recent()[0].id))?.state).toEqual({ input: 'hi' });

    await service.clearAll();
    expect(await bridge.store.history.list()).toHaveLength(0);
    expect(service.recent()).toEqual([]);
  });

  it('reports an entry the store refuses as too large', async () => {
    const bridge = fakeElectronBridge();
    bridge.store.history.add = async () => ({ ok: false, error: 'too-large' });
    Object.defineProperty(window, 'dude', { value: bridge, configurable: true, writable: true });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideBootSnapshot({ boot: await bridge.store.hydrate() })] });
    const service = TestBed.inject(HistoryService);

    await service.record('base64', 'x', { input: 'x' });

    expect(service.lastError()).toContain('too large');
    expect(service.recent()).toEqual([]);
  });
});
