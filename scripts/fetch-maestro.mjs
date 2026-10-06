import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Pinned official release, authenticated digest from GitHub's release metadata.
const version = '2.11.0';
const output = path.resolve('tmp/mobile-toolchain/maestro');
const response = await fetch(`https://api.github.com/repos/mobile-dev-inc/maestro/releases/tags/cli-${version}`, { headers: { Accept: 'application/vnd.github+json' } });
if (!response.ok) throw new Error(`Could not read official Maestro ${version} release metadata.`);
const release = await response.json();
const asset = release.assets.find(item => item.name === 'maestro.zip');
if (!asset?.digest?.match(/^sha256:[a-f0-9]{64}$/) || !asset.browser_download_url.startsWith('https://github.com/mobile-dev-inc/maestro/releases/download/')) throw new Error('Official Maestro archive has no verifiable SHA256 digest.');
const archiveResponse = await fetch(asset.browser_download_url);
if (!archiveResponse.ok) throw new Error('Could not download official Maestro archive.');
const bytes = Buffer.from(await archiveResponse.arrayBuffer());
if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== asset.digest) throw new Error('Maestro archive digest mismatch.');
mkdirSync(output, { recursive: true });
const archive = path.join(output, 'maestro.zip');
writeFileSync(archive, bytes);
const extraction = process.platform === 'win32'
  ? spawnSync('pwsh', ['-NoProfile', '-Command', '& { param($archive, $destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }', archive, output], { stdio: 'inherit' })
  : spawnSync('unzip', ['-q', '-o', archive, '-d', output], { stdio: 'inherit' });
if (extraction.error || extraction.status !== 0) throw new Error('Maestro archive extraction failed.');
console.log(`Verified Maestro ${version}: ${path.join(output, 'maestro/bin/maestro')}`);
