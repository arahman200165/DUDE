import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Usage: node scripts/ci-changes.mjs <base-sha> <head-sha>
// Decides which optional CI jobs a push or pull request needs from the files it changes, and writes `mobile=true|false` to
// $GITHUB_OUTPUT. The Android build and emulator journeys are skipped only when every changed file is in a path the Android app is
// not built from; anything else (new paths, workflows, scripts, dependencies, packages) runs them, and so does a range that cannot
// be diffed (a new branch, a force push or a missing base).
const root = path.resolve(import.meta.dirname, '..');

const outsideAndroid = [
  /\.md$/,
  /^docs\//,
  /^apps\/(?:web|desktop|hub|device-agent|collab-relay)\//,
  /^native\//,
  /^e2e\//,
  /^build\//,
  /^electron-builder\.yml$/,
  /^angular\.json$/,
  /^tsconfig\.(?:app|spec|worker)\.json$/,
  /^vitest\.(?:angular|electron|hub|perf)\.config\.mts$/,
  /^\.github\/dependabot\.yml$/,
  /^\.github\/workflows\/codeql\.yml$/,
];

export function needsAndroid(files) {
  return files === undefined || files.some(file => !outsideAndroid.some(pattern => pattern.test(file)));
}

export function changedFiles(base, head, git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8' })) {
  if (!/^[0-9a-f]{40}$/.test(base ?? '') || /^0+$/.test(base) || !/^[0-9a-f]{40}$/.test(head ?? '')) return undefined;
  if (git(['cat-file', '-e', `${base}^{commit}`]).status !== 0) return undefined;
  const diff = git(['diff', '--name-only', `${base}...${head}`]);
  if (diff.error || diff.status !== 0) return undefined;
  return diff.stdout.split(/\r?\n/).filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const files = changedFiles(process.argv[2], process.argv[3]);
  const mobile = needsAndroid(files);
  console.log(files === undefined ? 'Change range unavailable; running every job.' : `${files.length} changed file(s).`);
  console.log(`Android build and journeys: ${mobile ? 'run' : 'skip (no changed file reaches the Android app)'}.`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mobile=${mobile}\n`);
}
