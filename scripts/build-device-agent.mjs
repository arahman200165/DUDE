// Bundles the Device Agent (apps/device-agent/src/main.ts) to dist/electron/device-agent.js, baking in the
// release version that the desktop compares against during the version handshake (PD-026/PD-037).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

await build({
  entryPoints: [path.join(root, 'apps/device-agent/src/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: path.join(root, 'dist/electron/device-agent.js'),
  define: { __DUDE_VERSION__: JSON.stringify(version) },
  logLevel: 'info',
});
