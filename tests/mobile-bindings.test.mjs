import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMobileBindings } from '../scripts/generate-mobile-bindings.mjs';
import { mobileAvailability } from '../apps/mobile/src/registry/mobile-binding.ts';

const entry = id => ({ id, source: `export const bindingId = '${id}'; export const binding = { load: () => import('./${id}.screen') };` });
test('mobile discovery starts empty and derives literal imports in stable order', () => {
  const empty = buildMobileBindings([], ['base64']);
  assert.match(empty, /export const MOBILE_BINDINGS: MobileBindingMap = \{\n\};/);
  assert.doesNotMatch(empty, /binding0/);
  const output = buildMobileBindings([entry('uuid'), entry('base64')], ['base64', 'uuid']);
  assert.ok(output.indexOf("'../tools/base64/base64.mobile-bindings'") < output.indexOf("'../tools/uuid/uuid.mobile-bindings'"));
  assert.match(output, /'base64': binding0/);
  assert.match(output, /'uuid': binding1/);
  assert.equal(output, buildMobileBindings([entry('base64'), entry('uuid')], ['uuid', 'base64']));
});
test('mobile discovery rejects foreign, duplicated, misplaced or mismatched identities', () => {
  assert.throws(() => buildMobileBindings([entry('foreign')], ['base64']), /Unregistered/);
  assert.throws(() => buildMobileBindings([entry('base64'), entry('base64')], ['base64']), /Duplicate/);
  assert.throws(() => buildMobileBindings([{ ...entry('base64'), filename: 'other/base64.mobile-bindings.ts' }], ['base64']), /Misplaced/);
  assert.throws(() => buildMobileBindings([{ id: 'base64', source: entry('uuid').source }], ['base64']), /Mismatched/);
  assert.throws(() => buildMobileBindings([{ id: 'base64', source: "const bindingId = 'base64'; export const binding = {load:()=>import('./ui')};" }], ['base64']), /Mismatched/);
});
test('mobile discovery requires exported binding and literal lazy UI imports', () => {
  assert.throws(() => buildMobileBindings([{ id: 'base64', source: "export const bindingId = 'base64';" }], ['base64']), /Missing exported/);
  assert.throws(() => buildMobileBindings([{ id: 'base64', source: "export const bindingId = 'base64'; export const binding = {load:()=>Promise.resolve({})};" }], ['base64']), /Missing lazy/);
  assert.throws(() => buildMobileBindings([{ id: 'base64', source: "export const bindingId = 'base64'; export const binding = {load:()=>import(path)};" }], ['base64']), /Nonliteral/);
});
test('portable metadata cannot imply an executable mobile UI', () => {
  const metadata = { id: 'base64', capabilities: [] };
  assert.deepEqual(mobileAvailability(metadata, {}), { available: false, reason: 'Mobile UI is not implemented for this tool.', requiredCapabilities: [] });
  const binding = { load: () => Promise.resolve({ default: () => null }) };
  assert.deepEqual(mobileAvailability(metadata, { base64: binding }), { available: true, binding });
});
test('unavailable UI explanation derives existing manifest capabilities', () => {
  const capabilities = [{ kind: 'platform', id: 'native-system', web: 'unavailable', note: 'Reads Windows processes' }, { kind: 'runtime', runtime: 'pyodide' }];
  const availability = mobileAvailability({ id: 'process-viewer', capabilities }, {});
  assert.equal(availability.available, false);
  assert.match(availability.reason, /Reads Windows processes/);
  assert.deepEqual(availability.requiredCapabilities, capabilities);
  assert.equal(mobileAvailability({ id: 'python', capabilities: capabilities.slice(1) }, {}).available, false);
});
