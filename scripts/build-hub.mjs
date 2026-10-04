// Bundles the DUDE Hub into a single CJS file (the input to the Node SEA build).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const packageVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

/** `DUDE_VERSION_OVERRIDE` bakes a different version into the bundle (used by the service check to build an older "N-1" Hub). */
/**
 * `testBuild` bakes `__DUDE_HUB_TEST_BUILD__ = true` so the `DUDE_HUB_TEST_*` knobs are honoured (PD-068). The default release
 * bundle (SEA, service, Docker) bakes false and ignores them; the test bundle lives in dist/hub-test so it cannot be shipped by accident.
 */
export async function buildHub({ testBuild = false, outfile = path.join(root, 'dist', testBuild ? 'hub-test' : 'hub', 'dude-hub.cjs'), version = process.env['DUDE_VERSION_OVERRIDE'] || packageVersion } = {}) {
  await build({
    entryPoints: [path.join(root, 'apps/hub/src/main.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    outfile,
    external: ['bufferutil', 'utf-8-validate'],
    define: { __DUDE_VERSION__: JSON.stringify(version), __DUDE_HUB_TEST_BUILD__: JSON.stringify(testBuild) },
    logLevel: 'warning',
  });
  return outfile;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) {
  const testBuild = process.argv.includes('--test');
  const outfile = await buildHub({ testBuild });
  console.log(`Built ${path.relative(root, outfile)} (version ${process.env['DUDE_VERSION_OVERRIDE'] || packageVersion}${testBuild ? ', TEST BUILD' : ''})`);
}
