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
const workflow = parse(readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
const packageJob = workflow.jobs.package;
const publishJob = workflow.jobs.publish;
const steps = packageJob.steps;
const publish = publishJob.steps.find(step => step.name === 'Upload all assets to one draft release');
const derive = steps.find(step => step.id === 'release');
const version = '1.2.3';
const sha = '0123456789abcdef0123456789abcdef01234567';
const assets = [
  `release/DUDE-Setup-${version}.exe`,
  `release/DUDE-Setup-${version}.exe.blockmap`,
  'release/latest.yml',
  'dist/hub-installer/DUDE-Hub-Setup.exe',
  'release/SHA256SUMS.txt',
];

// Execute the real workflow PowerShell with only gh, git and npm replaced. Tests cannot
// contact GitHub or alter releases, and cover both first runs and retry failures.
const mockGh = String.raw`
function git {
  $global:LASTEXITCODE = 0
  switch ($args[0]) {
    'rev-parse' { if ($env:TEST_SCENARIO -eq 'shallow') { 'true' } else { 'false' } }
    'rev-list' {
      if ($env:TEST_SCENARIO -eq 'count-failure') { $global:LASTEXITCODE = 128; return }
      $env:TEST_COMMIT_COUNT
    }
    default { throw "Unexpected git invocation: $args" }
  }
}
function npm {
  Add-Content -LiteralPath $env:TEST_CALLS -Value (ConvertTo-Json -InputObject (@('npm') + $args) -Compress)
  $global:LASTEXITCODE = 0
}
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
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: overrides.TEST_PACKAGE_VERSION ?? version }));
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
        GITHUB_SHA: sha,
        TEST_COMMIT_COUNT: '856',
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

const gates = Object.keys(workflow.jobs).filter(name => !['package', 'publish', 'deploy'].includes(name));
const master = "github.ref == 'refs/heads/master' && github.event_name == 'push'";

test('publishes only from master pushes, after every gate and the packaging pass', () => {
  assert.deepEqual(new Set(publishJob.needs), new Set([...gates, 'package']));
  // Nothing ships, web or desktop, unless every check passes.
  assert.deepEqual(new Set(workflow.jobs.deploy.needs), new Set(gates));
  // Packaging runs alongside the gates, so it must not be able to write releases.
  assert.equal(packageJob.needs, undefined);
  assert.equal(packageJob.permissions.contents, 'read');
  assert.equal(publishJob.permissions.contents, 'write');
  for (const job of [packageJob, publishJob]) assert.equal(job.if, master);
  assert.equal(steps[0].with?.['fetch-depth'], 0);
  // The version is set after install and before anything that bakes it in.
  const index = name => steps.findIndex(step => step.name === name);
  assert.ok(index('Install dependencies') < steps.indexOf(derive));
  assert.ok(steps.indexOf(derive) < index('Build (Angular, Electron configuration)'));
  assert.equal(packageJob.outputs.version, '${{ steps.release.outputs.version }}');
  assert.equal(packageJob.outputs.tag, '${{ steps.release.outputs.tag }}');
  assert.equal(publish.env.RELEASE_VERSION, '${{ needs.package.outputs.version }}');
  assert.equal(publish.env.RELEASE_TAG, '${{ needs.package.outputs.tag }}');
});

test('packaging hands publish every asset through one artifact, verified before upload', () => {
  const upload = steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  const download = publishJob.steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(download.with.name, upload.with.name);
  assert.ok(publishJob.steps.indexOf(download) < publishJob.steps.indexOf(publish));
  // The artifact carries exactly what the publish script expects, at the same paths.
  const files = upload.with.path.trim().split(/\r?\n/).map(line => line.trim().replaceAll('${{ steps.release.outputs.version }}', version));
  assert.deepEqual(files, assets.slice(0, -1));
  for (const name of ['Verify packaged network helper', 'Verify the desktop installer embeds the Hub installer']) {
    assert.ok(steps.findIndex(step => step.name === name) < steps.indexOf(upload));
  }
});

test('one writer per commit, packaging without uploads', () => {
  assert.equal(publishJob.concurrency.group, 'release-${{ github.sha }}');
  assert.equal(publishJob.concurrency['cancel-in-progress'], false);
  const packageStep = steps.find(step => step.name === 'Package (NSIS)');
  assert.match(packageStep.run, /--publish never$/);
  assert.equal(packageStep.env?.GH_TOKEN, undefined);
  const writers = Object.entries(workflow.jobs).flatMap(([name, job]) =>
    job.steps.filter(step => /gh release (create|upload)/.test(step.run ?? '')).map(() => name));
  assert.deepEqual(writers, ['publish']);
});

test('release version is the package major.minor with the commit count as patch', () => {
  const valid = execute(derive.run, 'new', { TEST_PACKAGE_VERSION: '1.2.0' });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.output, /^version=1\.2\.856$/m);
  assert.match(valid.output, /^tag=v1\.2\.856$/m);
  assert.deepEqual(valid.calls, [['npm', 'version', '1.2.856', '--no-git-tag-version', '--allow-same-version']]);
  for (const [scenario, overrides, message] of [
    ['new', { TEST_PACKAGE_VERSION: '1.2.3' }, 'must be a <major>.<minor>.0 base'],
    ['shallow', { TEST_PACKAGE_VERSION: '1.2.0' }, 'needs full history'],
    ['count-failure', { TEST_PACKAGE_VERSION: '1.2.0' }, 'Could not count commits'],
  ]) {
    const invalid = execute(derive.run, scenario, overrides);
    assert.notEqual(invalid.status, 0);
    assert.ok(invalid.stderr.includes(message), invalid.stderr);
    assert.equal(invalid.output, '');
    assert.deepEqual(invalid.calls, []);
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
    if (create) assert.deepEqual(create.slice(2), ['v1.2.3', '--draft', '--target', sha, '--title', 'v1.2.3']);
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
