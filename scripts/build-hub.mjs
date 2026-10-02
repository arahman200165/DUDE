// Bundles the DUDE Hub into a single CJS file (the input to the Node SEA build).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

export async function buildHub({ outfile = path.join(root, 'dist', 'hub', 'dude-hub.cjs') } = {}) {
  await build({
    entryPoints: [path.join(root, 'apps/hub/src/main.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    outfile,
    external: ['bufferutil', 'utf-8-validate'],
    define: { __DUDE_VERSION__: JSON.stringify(version) },
    logLevel: 'warning',
  });
  return outfile;
}

if (import.meta.filename === path.resolve(process.argv[1] ?? '')) {
  const outfile = await buildHub();
  console.log(`Built ${path.relative(root, outfile)} (version ${version})`);
}
