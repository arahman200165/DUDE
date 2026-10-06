import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
export const signingVariables = ['DUDE_ANDROID_KEYSTORE_PATH', 'DUDE_ANDROID_KEYSTORE_PASSWORD', 'DUDE_ANDROID_KEY_ALIAS', 'DUDE_ANDROID_KEY_PASSWORD'];

export function packageConfiguration(env, baseVersion, shallow, count) {
  const missing = signingVariables.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error(`Android preview signing is required. Configure ${missing.join(', ')}. No unsigned/debug-key fallback is permitted.`);
  if (shallow !== 'false') throw new Error('Android versioning requires full Git history (fetch-depth: 0).');
  const base = /^(\d+)\.(\d+)\.0$/.exec(baseVersion);
  if (!base || !/^\d+$/.test(count) || Number(count) < 1 || Number(count) > 2100000000) throw new Error('Android version requires a major.minor.0 root version and a positive Android-compatible master commit count.');
  return { versionName: `${base[1]}.${base[2]}.${count}`, versionCode: Number(count) };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error(`${path.basename(command)} failed; see build output.`);
  return result.stdout?.trim() ?? '';
}

export function packageMobile(env = process.env) {
  // Check secrets before invoking tools. Secrets stay in environment variables,
  // never command arguments, Expo config, logs, or generated tracked files.
  const missing = signingVariables.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error(`Android preview signing is required. Configure ${missing.join(', ')}. No unsigned/debug-key fallback is permitted.`);
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const config = packageConfiguration(env, version, run('git', ['rev-parse', '--is-shallow-repository']), run('git', ['rev-list', '--count', 'HEAD']));
  const branch = run('git', ['branch', '--show-current']);
  const masterPush = env.CI && env.GITHUB_REF === 'refs/heads/master' && env.GITHUB_EVENT_NAME === 'push'
    && env.GITHUB_SHA === run('git', ['rev-parse', 'HEAD']);
  if (branch !== 'master' && !masterPush) throw new Error('Preview packaging derives versions from master; check out master before packaging.');
  if (run('git', ['status', '--porcelain'])) throw new Error('Commit source changes before preview packaging so the version identifies the exact master source.');
  if (!existsSync(path.resolve(env.DUDE_ANDROID_KEYSTORE_PATH))) throw new Error('Configured Android preview keystore does not exist.');
  const buildEnv = { ...env, DUDE_ANDROID_KEYSTORE_PATH: path.resolve(env.DUDE_ANDROID_KEYSTORE_PATH), DUDE_ANDROID_VERSION_NAME: config.versionName, DUDE_ANDROID_VERSION_CODE: String(config.versionCode), CI: '1' };
  run(process.execPath, ['scripts/check-mobile-toolchain.mjs'], { env: buildEnv, stdio: 'inherit' });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // On Windows npm.cmd needs cmd.exe; all arguments here are fixed literals.
  const npmRun = args => run(npm, args, { env: buildEnv, stdio: 'inherit', shell: process.platform === 'win32' });
  npmRun(['run', 'generate:registry']);
  npmRun(['run', 'build:packages']);
  npmRun(['run', 'mobile:prebuild']);
  const android = path.join(root, 'apps/mobile/android');
  run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [':app:assembleRelease', ':app:bundleRelease', '--console=plain', '--no-daemon'], { cwd: android, env: buildEnv, stdio: 'inherit', shell: process.platform === 'win32' });
  const output = path.join(root, 'dist/mobile-package');
  mkdirSync(output, { recursive: true });
  const files = [
    [path.join(android, 'app/build/outputs/apk/release/app-release.apk'), `DUDE-Preview-${config.versionName}.apk`],
    [path.join(android, 'app/build/outputs/bundle/release/app-release.aab'), `DUDE-Preview-${config.versionName}.aab`],
  ];
  const sums = files.map(([source, name]) => {
    if (!existsSync(source)) throw new Error(`Android release artifact missing: ${name}`);
    copyFileSync(source, path.join(output, name));
    return `${createHash('sha256').update(readFileSync(source)).digest('hex')}  ${name}`;
  });
  writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
  console.log(`Signed Android preview ${config.versionName} (${config.versionCode}) packaged in dist/mobile-package.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { packageMobile(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
