import fc from 'fast-check';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildPowerShellScript } from "@dude/contracts/shared/system/powershell-builder";

const dir = process.argv[2]; // scratch dir holding catalog.json (pwsh -File catalog.ps1 > catalog.json); cases.json/parsed.json are written there
const catalog = JSON.parse(readFileSync(dir + '/catalog.json', 'utf8'));
const okTypes = new Set(['string', 'boolean', 'switch', 'number', 'string[]', 'number[]', 'hashtable']);
const usable = catalog.filter((c) => /^[A-Za-z][A-Za-z0-9]*-[A-Za-z][A-Za-z0-9]*$/.test(c.name) && c.parameterSets.some((s) => s.parameters.some((p) => okTypes.has(p.type))));
const nasty = ["'", '\u2019', '\u2018', '\u201A', '\u201B', '$', '`', '"', '\\', '\n', '\r\n', ';', '|', '(', ')', '@', '{', '}', '-', ' ', '#', '<#', '#>', '&', '$(Get-Date)', '${x}', '`n', 'a', 'é', '漢', '😀', '%', '*', ',', '--', '-Name', '\t'];
const str = fc.oneof(fc.array(fc.constantFrom(...nasty), { maxLength: 8 }).map((a) => a.join('')), fc.string({ unit: 'grapheme', maxLength: 12 }).filter((s) => !s.includes('\0')));
const num = fc.oneof(fc.integer(), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.constantFrom(0, -0, 1e21, -1e21, 1e-7, 5e-324, Number.MAX_VALUE, -1.5, 0.1));
const scalar = fc.oneof(str, num, fc.boolean());
const hash = fc.dictionary(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 6 }).filter((s) => !s.includes('\0')), scalar, { maxKeys: 3 });
function valueFor(p) {
  if (p.validateSet?.length) return fc.constantFrom(...p.validateSet);
  switch (p.type) {
    case 'string': return str;
    case 'boolean': case 'switch': return fc.boolean();
    case 'number': return num;
    case 'string[]': return fc.array(str, { maxLength: 4 });
    case 'number[]': return fc.array(num, { maxLength: 4 });
    case 'hashtable': return hash;
  }
}
const stage = fc.constantFrom(...usable).chain((cmd) => {
  const sets = cmd.parameterSets.filter((s) => s.parameters.every((p) => okTypes.has(p.type) || !p.mandatory));
  if (!sets.length) return fc.constant(null);
  return fc.constantFrom(...sets).chain((set) => {
    const names = set.parameters.filter((p) => okTypes.has(p.type));
    return fc.tuple(...names.map((p) => fc.tuple(fc.constant(p), p.mandatory ? fc.constant(true) : fc.boolean(), valueFor(p)))).map((entries) => {
      const parameters = {};
      for (const [p, include, value] of entries) if (include) parameters[p.name] = value;
      return { cmdlet: cmd.name, parameters };
    });
  });
});
const format = fc.oneof(
  fc.constant({ kind: 'none' }),
  fc.record({ kind: fc.constantFrom('table', 'list', 'select'), properties: fc.option(fc.array(str, { minLength: 1, maxLength: 3 }), { nil: undefined }) }),
  fc.record({ kind: fc.constant('json'), depth: fc.integer({ min: 1, max: 100 }) }),
  fc.record({ kind: fc.constant('csv'), delimiter: fc.constantFrom(',', ';', "'", '\u2019', '\t', '|', '$', '`', '"') }),
);
const caseArb = fc.record({ stages: fc.array(stage.filter((s) => s !== null), { minLength: 1, maxLength: 3 }), format });
const N = Number(process.argv[3] ?? 1500);
const cases = [];
let skipped = 0; const reasons = {};
for (const value of fc.sample(caseArb, { numRuns: N, seed: 612 })) {
  let built;
  try { built = buildPowerShellScript(value.stages, value.format, catalog); }
  catch (e) { skipped++; reasons[String(e.message).replace(/[A-Z][A-Za-z0-9-]+-[A-Za-z0-9]+/g,'X')] = (reasons[String(e.message).replace(/[A-Z][A-Za-z0-9-]+-[A-Za-z0-9]+/g,'X')]||0)+1; continue; }
  const expected = value.stages.map(({ cmdlet, parameters }) => ({ cmdlet, params: parameters }));
  const f = value.format;
  if (f.kind === 'table' || f.kind === 'list' || f.kind === 'select') expected.push({ cmdlet: f.kind === 'table' ? 'Format-Table' : f.kind === 'list' ? 'Format-List' : 'Select-Object', params: f.properties?.length ? { Property: f.properties } : {} });
  if (f.kind === 'json') expected.push({ cmdlet: 'ConvertTo-Json', params: { Depth: f.depth } });
  if (f.kind === 'csv') expected.push({ cmdlet: 'ConvertTo-Csv', params: { NoTypeInformation: null, Delimiter: f.delimiter } });
  cases.push({ script: built.script, expected });
}
writeFileSync(dir + '/cases.json', JSON.stringify(cases));
console.log('cases', cases.length, 'skipped (builder rejected, e.g. no viable set)', skipped);
