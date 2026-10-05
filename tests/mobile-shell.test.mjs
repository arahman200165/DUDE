import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileDeepLinkPath } from '../apps/mobile/src/navigation/deep-links.ts';
import { createMemoryWorkbench, INITIAL_WORKBENCH, newToolFavorite, patchAppearanceFields, updateFavorite } from '../apps/mobile/src/state/workbench-model.ts';
import { discoverTools, TOOL_BY_ID } from '../apps/mobile/src/registry/discovery.ts';
import { TOOL_METADATA } from '@dude/tool-registry';
import { TOOL_CATEGORIES } from '@dude/shared-types/shared/models/tool-category.model';

test('native tool links use the shared parser and support navigation-only tools alias', () => {
  assert.equal(mobileDeepLinkPath('dude://open/tool/json'), '/tools/json');
  assert.equal(mobileDeepLinkPath('dude://tools/json'), '/tools/json');
  assert.equal(mobileDeepLinkPath('dude://open/settings/appearance'), '/settings/appearance');
  assert.equal(mobileDeepLinkPath('dude://open/settings/connection'), '/settings/connection');
  assert.equal(mobileDeepLinkPath('dude://open/settings/sync'), '/settings/sync');
  assert.equal(mobileDeepLinkPath('dude://open/settings/recovery'), '/settings/recovery');
  assert.equal(mobileDeepLinkPath('dude://open/settings'), '/(tabs)/settings');
});

test('native links refuse execution, payloads, credentials and malformed routes', () => {
  for (const link of ['dude://run/pipeline/id', 'dude://open/project/id', 'dude://tools/json?input=secret', 'dude://tools/json#payload', 'dude://tools/json/extra', 'dude://user:secret@tools/json', 'dude://tools/json%2Fextra', 'dude://open/settings/unknown', 'dude://open/settings/recovery?import=secret', 'dude://open/settings/connection?pairing=secret', 'https://tools/json', 'dude://tools/' + 'x'.repeat(2050)]) {
    assert.equal(mobileDeepLinkPath(link), null, link);
  }
});

test('registry discovery is exhaustive, category-derived and searches stable IDs', () => {
  assert.equal(discoverTools('').length, TOOL_METADATA.length);
  assert.equal(TOOL_BY_ID.size, TOOL_METADATA.length);
  for (const category of TOOL_CATEGORIES) {
    const expected = TOOL_METADATA.filter(tool => tool.category === category);
    assert.deepEqual(discoverTools('', category), expected);
  }
  const example = TOOL_METADATA.find(tool => tool.id.includes('-'));
  assert.ok(example);
  assert.ok(discoverTools(example.id).some(tool => tool.id === example.id));
  assert.deepEqual(discoverTools('there-is-no-such-tool-identity'), []);
});

test('pin and unpin preserve unrelated pipelines, unknown tools and exact record ordering', () => {
  const pipeline = { id: 'pipeline:future-pipeline', kind: 'pipeline', targetId: 'future-pipeline', order: 4, pinnedAt: '2026-10-04T12:00:00Z', futureField: 'retain' };
  const unknown = { id: 'tool:future-tool', kind: 'tool', targetId: 'future-tool', order: 9 };
  const items = [pipeline, unknown];
  const pin = newToolFavorite(items, 'json');
  assert.equal(pin.order, 10);
  assert.deepEqual(updateFavorite(items, pin, true), [pipeline, unknown, pin]);
  assert.equal(updateFavorite(items, unknown, true), items);
  assert.deepEqual(updateFavorite([pipeline, unknown, pin], pin, false), items);
  assert.deepEqual(updateFavorite(items, unknown, false), [pipeline]);
});

test('appearance changes retain unsupported cached fields and desktop font choices', () => {
  const raw = { mode: 'dark', uiFont: { custom: 'Desktop Family' }, monoFont: 'fira-code', futureSetting: { preserve: true } };
  const patched = patchAppearanceFields(raw, { mode: 'light', motion: 'reduce' });
  assert.deepEqual(patched, { ...raw, mode: 'light', motion: 'reduce' });
  assert.equal(patched.uiFont, raw.uiFont);
  assert.equal(patched.futureSetting, raw.futureSetting);
  assert.equal(raw.mode, 'dark');
});

test('memory facade publishes local edits and returns no native enrollment or sync success', async () => {
  const backend = createMemoryWorkbench();
  let notifications = 0;
  const unsubscribe = backend.subscribe(() => { notifications++; });
  const pin = newToolFavorite([], 'json');
  assert.equal((await backend.actions.setFavorite(pin, true)).ok, true);
  assert.equal((await backend.actions.patchAppearance({ accent: 'blue' })).ok, true);
  assert.equal(notifications, 2);
  assert.equal(backend.getSnapshot().connection.kind, 'standalone');
  assert.equal(backend.getSnapshot().sync.phase, 'local-only');
  assert.equal(backend.getSnapshot().durability, 'memory');
  for (const action of [() => backend.actions.connect({ pairingString: 'secret', displayName: 'phone', acknowledged: true }), () => backend.actions.syncNow(), () => backend.actions.previewDisconnect(), () => backend.actions.disconnect('unbound'), () => backend.actions.previewClearCache(), () => backend.actions.clearCache('unbound')]) {
    assert.equal((await action()).ok, false);
  }
  assert.equal(notifications, 2);
  assert.deepEqual(INITIAL_WORKBENCH.favorites, []);
  unsubscribe();
  await backend.actions.setFavorite(pin, false);
  assert.equal(notifications, 2);
});
