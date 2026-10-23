import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedFiles, needsAndroid } from './ci-changes.mjs';

test('Android jobs are skipped only when every change is outside the Android build', () => {
  assert.equal(needsAndroid(['docs/delivery/ROADMAP.md', 'apps/web/src/app/tools/base64/base64.ts', 'apps/hub/src/server/app.ts', 'e2e/hub/hub.spec.ts']), false);
  assert.equal(needsAndroid([]), false);
  for (const file of [
    'apps/mobile/app/_layout.tsx',
    'apps/mobile/.maestro/tools/regex.yaml',
    'packages/tool-engine/src/tools/regex/regex-match.ts',
    'package-lock.json',
    'package.json',
    'scripts/mobile-e2e.mjs',
    '.github/workflows/ci.yml',
    'tsconfig.json',
    'some-new-top-level-file.txt',
  ]) assert.equal(needsAndroid(['docs/README.md', file]), true, file);
});

test('an unavailable change range runs every job', () => {
  assert.equal(needsAndroid(undefined), true);
  const sha = 'a'.repeat(40);
  const git = () => ({ status: 0, stdout: 'docs/x.md\n' });
  assert.deepEqual(changedFiles(sha, 'b'.repeat(40), git), ['docs/x.md']);
  assert.equal(changedFiles('0'.repeat(40), sha, git), undefined);
  assert.equal(changedFiles('', sha, git), undefined);
  assert.equal(changedFiles(sha, '', git), undefined);
  assert.equal(changedFiles(sha, 'b'.repeat(40), args => ({ status: args[0] === 'cat-file' ? 128 : 0, stdout: '' })), undefined);
  assert.equal(changedFiles(sha, 'b'.repeat(40), args => ({ status: args[0] === 'diff' ? 128 : 0, stdout: '' })), undefined);
});
