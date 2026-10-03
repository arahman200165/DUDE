import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parse } from 'yaml';
import { PublishManager } from 'app-builder-lib/out/publish/PublishManager.js';
import { Platform } from 'app-builder-lib';
import { Arch } from 'builder-util';
import { CancellationToken } from 'builder-util-runtime';

const root = path.resolve(import.meta.dirname, '..');
const workflow = parse(readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8'));
const steps = workflow.jobs.build.steps;
const publish = steps.find(step => step.name === 'Upload all assets to one draft release');
const validate = steps.find(step => step.id === 'release');
const version = '1.2.3';
const assets = [
  `release/DUDE-Setup-${version}.exe`,
  `release/DUDE-Setup-${version}.exe.blockmap`,
  'release/latest.yml',
  'dist/hub-installer/DUDE-Hub-Setup.exe',
  'release/SHA256SUMS.txt',
];

// Execute the real workflow PowerShell with only GitHub replaced. Tests cannot
// contact GitHub or alter releases, and cover both first runs and retry failures.
const mockGh = String.raw`
function gh {
  Add-Content -LiteralPath $env:TEST_CALLS -Value (ConvertTo-Json -InputObject @($args) -Compress)
  $global:LASTEXITCODE = 0
  switch ("$($args[0]) $($args[1])") {
    'api --paginate' {
      if ($env:TEST_SCENARIO -eq 'list-failure') { $global:LASTEXITCODE = 1; return }
      # An unrelated release must not affect matching; separate lines model pagination.
      '{"id":1,"tag_name":"v9.9.9","draft":false}'
      if ($env:TEST_SCENARIO -in @('reuse', 'duplicates', 'published')) {
        @{ id = 2; tag_name = $env:RELEASE_TAG; draft = ($env:TEST_SCENARIO -ne 'published') } | ConvertTo-Json -Compress
      }
      if ($env:TEST_SCENARIO -eq 'duplicates') {
        @{ id = 3; tag_name = $env:RELEASE_TAG; draft = $true } | ConvertTo-Json -Compress
      }
    }
    'release create' {
      if ($env:TEST_SCENARIO -eq 'create-failure') { $global:LASTEXITCODE = 1 }
    }
    'release upload' {
      if ($env:TEST_SCENARIO -eq 'upload-failure') { $global:LASTEXITCODE = 1 }
      $global:uploadedPaths = @($args | Select-Object -Skip 3 | Where-Object { $_ -ne '--clobber' })
    }
    'release view' {
      if ($env:TEST_SCENARIO -eq 'view-failure') { $global:LASTEXITCODE = 1; return }
      $remote = @($global:uploadedPaths | ForEach-Object {
        $file = Get-Item -LiteralPath $_
        @{ name = $file.Name; size = $file.Length }
      })
      if ($env:TEST_SCENARIO -eq 'incomplete') { $remote[0].size = 0 }
      @{ isDraft = ($env:TEST_SCENARIO -ne 'no-longer-draft'); assets = $remote } | ConvertTo-Json -Depth 4 -Compress
    }
    default { throw "Unexpected gh invocation: $args" }
  }
}
`;

function execute(script, scenario, overrides = {}, missing) {
  const tmpRoot = path.join(root, 'tmp');
  mkdirSync(tmpRoot, { recursive: true });
  const dir = mkdtempSync(path.join(tmpRoot, 'release-workflow-'));
  try {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
    for (const file of assets.slice(0, -1)) {
      if (file === missing) continue;
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), `fixture: ${file}`);
    }
    const calls = path.join(dir, 'calls.jsonl');
    const output = path.join(dir, 'outputs.txt');
    const scriptPath = path.join(dir, 'test.ps1');
    writeFileSync(scriptPath, `$ErrorActionPreference = 'Stop'\n${mockGh}\n${script}`);
    const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-File', scriptPath], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GH_REPO: 'fixture/repository',
        RELEASE_VERSION: version,
        RELEASE_TAG: `v${version}`,
        GITHUB_REF_TYPE: 'tag',
        GITHUB_REF_NAME: `v${version}`,
        GITHUB_REF: `refs/tags/v${version}`,
        GITHUB_OUTPUT: output,
        TEST_SCENARIO: scenario,
        TEST_CALLS: calls,
        ...overrides,
      },
    });
    if (result.error) throw result.error;
    const read = file => {
      try { return readFileSync(file, 'utf8'); } catch (error) {
        if (error.code === 'ENOENT') return '';
        throw error;
      }
    };
    return {
      ...result,
      calls: read(calls).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)),
      output: read(output),
      checksums: read(path.join(dir, assets.at(-1))),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('one writer per tag, packaging without uploads, verification before publication', () => {
  assert.equal(workflow.concurrency.group, 'release-${{ github.ref }}');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  const packageStep = steps.find(step => step.name === 'Package (NSIS)');
  assert.match(packageStep.run, /--publish never$/);
  assert.equal(packageStep.env?.GH_TOKEN, undefined);
  assert.equal(steps.filter(step => /gh release (create|upload)/.test(step.run ?? '')).length, 1);
  for (const name of ['Verify packaged network helper', 'Verify the desktop installer embeds the Hub installer']) {
    assert.ok(steps.findIndex(step => step.name === name) < steps.indexOf(publish));
  }
});

test('tag validation accepts the package tag and refuses branches or version mismatch', () => {
  const valid = execute(validate.run, 'new');
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.output, /version=1\.2\.3/);
  assert.match(valid.output, /tag=v1\.2\.3/);
  for (const overrides of [{ GITHUB_REF_TYPE: 'branch' }, { GITHUB_REF_NAME: 'v1.2.4' }]) {
    const invalid = execute(validate.run, 'new', overrides);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Release must run on the package version tag/);
  }
});

for (const scenario of ['new', 'reuse']) {
  test(`${scenario}: uploads all five assets into one draft and verifies completeness`, () => {
    const result = execute(publish.run, scenario);
    assert.equal(result.status, 0, result.stderr);
    const commands = result.calls.map(call => call.slice(0, 2).join(' '));
    assert.deepEqual(commands, scenario === 'new'
      ? ['api --paginate', 'release create', 'release upload', 'release view']
      : ['api --paginate', 'release upload', 'release view']);
    const create = result.calls.find(call => call[1] === 'create');
    if (create) assert.deepEqual(create.slice(2), ['v1.2.3', '--draft', '--verify-tag', '--title', 'v1.2.3']);
    const upload = result.calls.find(call => call[1] === 'upload');
    assert.deepEqual(upload.slice(3, -1).map(file => file.replaceAll('\\', '/')), assets);
    assert.equal(upload.at(-1), '--clobber');
    const expected = [assets[0], assets[3]].map(file =>
      `${createHash('sha256').update(`fixture: ${file}`).digest('hex')}  ${path.basename(file)}`);
    assert.deepEqual(result.checksums.trim().split(/\r?\n/), expected);
  });
}

for (const [scenario, message] of [
  ['duplicates', 'Multiple releases already exist'],
  ['published', 'already published'],
  ['list-failure', 'Could not list'],
  ['create-failure', 'Could not create'],
  ['upload-failure', 'Could not upload'],
  ['view-failure', 'Could not verify'],
  ['incomplete', 'incomplete asset'],
  ['no-longer-draft', 'must remain a draft'],
]) {
  test(`${scenario}: fails explicitly without reporting a successful release`, () => {
    const result = execute(publish.run, scenario);
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(message), result.stderr);
    if (['duplicates', 'published', 'list-failure', 'create-failure'].includes(scenario)) {
      assert.ok(!result.calls.some(call => call[1] === 'upload'));
    }
  });
}

test('missing update metadata aborts before any GitHub operation', () => {
  const result = execute(publish.run, 'new', {}, 'release/latest.yml');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing release asset/);
  assert.deepEqual(result.calls, []);
});

test('installed electron-builder generates updater metadata with publishing disabled', async () => {
  const tmpRoot = path.join(root, 'tmp');
  mkdirSync(tmpRoot, { recursive: true });
  const dir = mkdtempSync(path.join(tmpRoot, 'release-metadata-'));
  try {
    const config = parse(readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'));
    let afterPack;
    let artifactCreated;
    const packager = {
      config,
      appInfo: { version, updaterCacheDirName: 'fixture-updater' },
      repositoryInfo: { type: 'github', user: 'fixture', project: 'repository' },
      cancellationToken: new CancellationToken(),
      onAfterPack(handler) { afterPack = handler; },
      onArtifactCreated(handler) { artifactCreated = handler; },
      emitArtifactCreated(event) { return artifactCreated(event); },
    };
    const manager = new PublishManager(packager, { publish: 'never' });
    manager.scheduleUpload = () => { throw new Error('Packaging must not schedule uploads'); };
    assert.equal(manager.isPublish, false);
    const platformPackager = {
      info: packager,
      config,
      appInfo: packager.appInfo,
      platform: Platform.WINDOWS,
      platformOptions: config.win,
      platformSpecificBuildOptions: config.win,
      expandMacro(value) { return value; },
      getResource() { return null; },
      getResourcesDir() { return dir; },
    };
    const target = { name: 'nsis', options: config.nsis, outDir: dir };
    await afterPack({ packager: platformPackager, targets: [target], arch: Arch.x64, appOutDir: dir });
    const updater = parse(readFileSync(path.join(dir, 'app-update.yml'), 'utf8'));
    assert.equal(updater.provider, 'github');
    assert.equal(updater.owner, 'fixture');
    assert.equal(updater.repo, 'repository');
    const file = path.join(dir, `DUDE-Setup-${version}.exe`);
    writeFileSync(file, 'installer fixture');
    await artifactCreated({ packager: platformPackager, target, arch: Arch.x64, file, isWriteUpdateInfo: true });
    await manager.awaitTasks();
    const latest = parse(readFileSync(path.join(dir, 'latest.yml'), 'utf8'));
    assert.equal(latest.version, version);
    assert.equal(latest.path, path.basename(file));
    assert.equal(latest.files[0].url, path.basename(file));
    assert.equal(latest.sha512, createHash('sha512').update('installer fixture').digest('base64'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
