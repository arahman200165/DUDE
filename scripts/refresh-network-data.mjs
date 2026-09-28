#!/usr/bin/env node
/**
 * Refreshes the bundled Phase 28 reference data under electron/data/ (DUDE_PRD.md §21 Phase 28):
 *   - public-suffix-rules.json — Mozilla Public Suffix List rules (DMARC organizational domain)
 *   - ct-log-list.json         — Google/Chrome CT log list v3 (SCT log names and keys)
 *
 * The app never downloads these at runtime; this script is run by a maintainer and the result is
 * committed with its retrieval date, so every lookup stays local.
 *
 *   node scripts/refresh-network-data.mjs [--only psl|ct]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'electron', 'data');
mkdirSync(out, { recursive: true });
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const retrievedAt = new Date().toISOString();

async function text(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.text();
}

if (!only || only === 'psl') {
  const source = 'https://publicsuffix.org/list/public_suffix_list.dat';
  const rules = (await text(source)).split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('//'))
    .map((line) => line.split(/\s/)[0].toLowerCase());
  if (rules.length < 5000) throw new Error(`PSL looks truncated (${rules.length} rules).`);
  writeFileSync(join(out, 'public-suffix-rules.json'), JSON.stringify({ source, retrievedAt, license: 'MPL-2.0', rules }));
  console.log(`public-suffix-rules.json: ${rules.length} rules`);
}

if (!only || only === 'ct') {
  const source = 'https://www.gstatic.com/ct/log_list/v3/log_list.json';
  const list = JSON.parse(await text(source));
  const logs = list.operators.flatMap((operator) => operator.logs.map((log) => ({
    operator: operator.name, description: log.description, logId: log.log_id, key: log.key, url: log.url,
    state: Object.keys(log.state ?? {})[0] ?? 'unknown', mmd: log.mmd,
    ...(log.temporal_interval ? { temporalInterval: log.temporal_interval } : {}),
  })));
  if (logs.length < 10) throw new Error(`CT log list looks truncated (${logs.length} logs).`);
  writeFileSync(join(out, 'ct-log-list.json'), JSON.stringify({ source, retrievedAt, listVersion: list.version, logListTimestamp: list.log_list_timestamp, logs }));
  console.log(`ct-log-list.json: ${logs.length} logs`);
}
