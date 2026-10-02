// Asserts every workspace package.json is COPYed in each Dockerfile that runs `npm ci`,
// so adding a workspace can never silently break the container builds again.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dockerfiles = ['apps/hub/Dockerfile', 'apps/collab-relay/Dockerfile'];

const manifests = [];
for (const family of ['apps', 'packages']) {
  for (const entry of readdirSync(path.join(root, family), { withFileTypes: true })) {
    const manifest = `${family}/${entry.name}/package.json`;
    if (entry.isDirectory() && existsSync(path.join(root, manifest))) manifests.push(manifest);
  }
}

const problems = [];
for (const file of dockerfiles) {
  const text = readFileSync(path.join(root, file), 'utf8').replace(/\\r?\n/g, ' ');
  const copied = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*COPY\s+(?:--\S+\s+)*(.+)$/i.exec(line);
    if (match) for (const token of match[1].trim().split(/\s+/).slice(0, -1)) copied.add(token.replace(/^\.\//, ''));
  }
  for (const manifest of manifests) {
    if (!copied.has(manifest)) problems.push(`${file}: missing "COPY ${manifest} ./${manifest}" before npm ci`);
  }
  for (const manifest of ['package.json', 'package-lock.json']) {
    if (!copied.has(manifest)) problems.push(`${file}: missing COPY of ${manifest}`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Dockerfiles copy all ${manifests.length} workspace manifests (${dockerfiles.join(', ')}).`);
