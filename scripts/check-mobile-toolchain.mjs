import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Honor a task-local JAVA_HOME; never install or change the user's system toolchain.
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
const output = (result.stdout ?? '') + (result.stderr ?? '');
if (result.error || result.status !== 0 || !/version "17[.\"]/.test(output)) {
  console.error('DUDE Android requires JDK 17. Set JAVA_HOME to a JDK 17 installation before running mobile:android.');
  process.exitCode = 1;
} else if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT) {
  console.error('Set ANDROID_HOME to your Android SDK before running mobile:android.');
  process.exitCode = 1;
} else console.log('JDK 17 and Android SDK environment are configured.');
