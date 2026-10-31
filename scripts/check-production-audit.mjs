// Production dependency audit gate: `npm audit --omit=dev`, failing on any high/critical finding
// except an explicitly accepted advisory. An acceptance only holds while npm reports no fix for
// the package; once a patched release exists the finding fails again so it gets upgraded rather
// than staying silently allowlisted. Rationale for each entry: docs/delivery/PHASE31A_ACCEPTANCE.md.
//
// Usage: npm run audit:prod
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const FAILING_SEVERITIES = new Set(['high', 'critical']);

// package -> accepted advisory URLs.
const ACCEPTED = new Map([
  // Stack exhaustion on deeply nested brace patterns; braces 3.0.3 is the latest release and the
  // advisory covers <=3.0.3. Reached only through expo's Metro file map in the mobile workspace,
  // which globs the developer's own project at build time, never untrusted input or shipped code.
  // Accepted 2026-10-07.
  ['braces', new Set(['https://github.com/advisories/GHSA-vfj7-8cjw-p6xm'])],
  // Memory exhaustion validating oversized constrained collections; fixed only in zod 4.6.6, and @expo/cli
  // pins zod ^3.25.76 (3.25.76 is the last 3.x). Expo's CLI validates its own dev-tools plugin schemas
  // during `expo start`, never untrusted input or shipped code. The root zod (via @angular/forms) is on a
  // patched 4.x. Accepted 2026-10-25.
  ['zod', new Set(['https://github.com/advisories/GHSA-mrhx-c7xc-m3w5'])],
  // Quadratic replacement of percent-encoded runs; fixed only in decode-uri-component 0.5.1, which is
  // ESM-only, while query-string 7.1.3 (the last 7.x, pinned by expo-router) `require()`s it and calls
  // the result as a function, so forcing 0.5.1 would break query parsing. Reached only through
  // expo-router in the mobile workspace; the worst case is a slow query-string parse in the app
  // process, with no data exposure. Accepted 2026-10-30.
  ['decode-uri-component', new Set(['https://github.com/advisories/GHSA-qr28-fpjm-wq7f'])],
]);

// `npm audit` reports `fixAvailable` as a semver-major object for a package whose only "fix" is
// downgrading the parent that pulls it in (e.g. expo 44 for node-forge). That is not a patched
// release of the vulnerable package, so only `true` or a non-major bump counts as a fix.
const hasFix = (fixAvailable) => fixAvailable === true || (typeof fixAvailable === 'object' && fixAvailable !== null && !fixAvailable.isSemVerMajor);

const npmCli = process.env.npm_execpath;
if (!npmCli) throw Error('Run through npm run audit:prod');
const result = spawnSync(process.execPath, [npmCli, 'audit', '--omit=dev', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error(result.stderr || result.stdout);
  throw Error('npm audit did not return a JSON report');
}
if (report.error) throw Error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);

const vulnerabilities = report.vulnerabilities ?? {};
const failures = [];
const accepted = [];
for (const [name, vuln] of Object.entries(vulnerabilities)) {
  if (!FAILING_SEVERITIES.has(vuln.severity)) continue;
  // `via` mixes advisory objects with names of vulnerable dependencies this package pulls in;
  // those dependencies are judged under their own entries.
  const advisories = vuln.via.filter((via) => typeof via === 'object' && FAILING_SEVERITIES.has(via.severity));
  if (!advisories.length) continue;
  const allowed = ACCEPTED.get(name);
  const unaccepted = advisories.filter((via) => !allowed?.has(via.url));
  if (unaccepted.length) failures.push(`${name} (${vuln.severity}): ${unaccepted.map((via) => `${via.url} ${via.title}`).join('; ')}`);
  else if (hasFix(vuln.fixAvailable)) failures.push(`${name} (${vuln.severity}): accepted advisory now has a fix; upgrade and remove it from ACCEPTED`);
  else accepted.push(`${name}: ${advisories.map((via) => via.url).join(', ')}`);
}

for (const line of accepted) console.log(`Accepted (no fix available): ${line}`);
if (failures.length) {
  console.error('Production audit failed:');
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log('Production audit passed: no unaccepted high/critical advisories.');
