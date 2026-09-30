import { readFileSync } from 'node:fs';
const dir = process.argv[2];
const cases = JSON.parse(readFileSync(dir + '/cases.json', 'utf8'));
const parsed = JSON.parse(readFileSync(dir + '/parsed.json', 'utf8'));
function norm(v) {
  if (v === null) return { t: 'flag', v: null };
  if (typeof v === 'string') return { t: 's', v };
  if (typeof v === 'number') return { t: 'n', v };
  if (typeof v === 'boolean') return { t: 'b', v };
  if (Array.isArray(v)) return { t: 'a', v: v.map(norm) };
  return { t: 'h', v: Object.entries(v).map(([k, x]) => ({ k, v: norm(x) })) };
}
function same(actual, expected) {
  if (expected.t === 'a') return actual.t === 'a' && actual.v.length === expected.v.length && actual.v.every((x, i) => same(x, expected.v[i]));
  if (expected.t === 'h') {
    const a = new Map(actual.v.map((p) => [p.k, p.v]));
    return actual.t === 'h' && actual.v.length === expected.v.length && expected.v.every((p) => a.has(p.k) && same(a.get(p.k), p.v));
  }
  if (expected.t === 'n') return actual.t === 'n' && (actual.v === expected.v || Object.is(actual.v, expected.v));
  return actual.t === expected.t && actual.v === expected.v;
}
// PowerShell Hashtable keys are case-insensitive; the generator can emit keys differing only by case, so skip those.
let fail = 0, checked = 0, params = 0;
cases.forEach((c, i) => {
  const p = parsed[i];
  const problems = [];
  if (p.errors.length) problems.push('errors: ' + JSON.stringify(p.errors));
  if (p.commands.length !== c.expected.length) problems.push(`command count ${p.commands.length} != ${c.expected.length}`);
  else c.expected.forEach((e, k) => {
    const got = p.commands[k];
    if (got.name.toLowerCase() !== e.cmdlet.toLowerCase()) problems.push(`name ${got.name} != ${e.cmdlet}`);
    const gotKeys = Object.keys(got.params);
    const wantKeys = Object.keys(e.params);
    if (gotKeys.length !== wantKeys.length) problems.push(`param count ${gotKeys.join(',')} != ${wantKeys.join(',')}`);
    for (const key of wantKeys) {
      params++;
      const gk = gotKeys.find((x) => x.toLowerCase() === key.toLowerCase());
      if (!gk) { problems.push(`missing -${key}`); continue; }
      const want = e.params[key];
      // boolean/switch are rendered -Name:$x, which the AST reports as a variable argument
      if (!same(got.params[gk], norm(want))) problems.push(`-${key}: got ${JSON.stringify(got.params[gk])} want ${JSON.stringify(norm(want))}`);
    }
  });
  checked++;
  if (problems.length) { fail++; if (fail <= 8) console.log('FAIL', JSON.stringify(c.script).slice(0, 400), problems.slice(0, 3)); }
});
console.log(`checked ${checked} commands lines, ${params} parameter values, failures ${fail}`);
process.exit(fail ? 1 : 0);
