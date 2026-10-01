import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import MarkdownIt from 'markdown-it';

const baseline = 'b51fd71b785aea04774ab5d6decffc1bbf366c9a';
const source = execFileSync('git', ['show', `${baseline}:DUDE_PRD.md`], {encoding: 'utf8'}).replace(/\r\n/g, '\n');
const files = [
  'docs/DUDE_PRD.md', 'docs/product/PRODUCT_SPEC.md', 'docs/product/UX_SPEC.md',
  'docs/architecture/SYSTEM_ARCHITECTURE.md', 'docs/architecture/DATA_SYNC_ARCHITECTURE.md',
  'docs/architecture/SECURITY_ARCHITECTURE.md', 'docs/delivery/ROADMAP.md',
  'docs/delivery/QUALITY_AND_RELEASE.md', 'docs/history/DELIVERY_HISTORY.md', 'docs/history/DECISION_LOG.md',
];
const targets = files.map(file => ({file, text: fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')}));
const md = new MarkdownIt({html: true});
const hash = text => createHash('sha256').update(text).digest('hex');
const appendixAnchors = {
  'interview-questions-and-answers': 'A', 'v1-scope-in-one-sentence-delivered': 'B',
  'scope-evolution-record': 'C', 'commercialization-context': 'D',
  'reconciliation-decisions-and-requirement-traceability': 'E',
};

// Normalize navigation syntax only. Ordinary words, dates, identifiers, values,
// punctuation, list numbers, checkboxes and table columns are not normalized away.
function canonical(line, from) {
  line = line.trim();
  line = line.replace(/(?:`DUDE_PRD\.md`|DUDE_PRD\.md|PRD)\s+(?=§\d)/g, '');
  line = line.replace(/§§(\d+(?:\.\d+)*(?:,?\s+(?:and\s+)?\d+(?:\.\d+)*)*)/g,
    (_match, numbers) => numbers.replace(/\d+(?:\.\d+)*/g, '<SECTION>'));
  line = line.replace(/(?:§|Sections?\s+)(\d+(?:\.\d+)*(?:\.[A-Z])?)(?!\w|\.\d)/g, '<SECTION>');
  line = line.replace(/Appendix ([A-E])(?:\s+§([A-E]\.\d+))?/g, (_match, letter, subsection) => subsection ? '<SECTION>' : `<APPENDIX:${letter}>`);
  line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, destination) => {
    const [file, anchor] = destination.split('#');
    if (/^https?:/.test(file)) return match;
    const resolved = file ? path.posix.normalize(path.posix.join(path.posix.dirname(from), file)) : from;
    if (!files.includes(resolved) && resolved !== 'DUDE_PRD.md') return match;
    if (appendixAnchors[anchor]) return `<APPENDIX:${appendixAnchors[anchor]}>`;
    if (/^phase-\d+[a-z]?$/.test(anchor)) return `<SECTION> Phase ${anchor.slice(6).toUpperCase()}`;
    if (anchor) return '<SECTION>';
    return match;
  });
  return line;
}

function scan(text, file, original = false) {
  const lines = text.split('\n');
  const records = [], headings = [];
  let fence = null, section = 'Front matter', phase = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fm = line.match(/^\s*(`{3,}|~{3,})/);
    if (fm) { if (!fence) fence = fm[1][0]; else if (fence === fm[1][0]) fence = null; continue; }
    if (fence) continue;
    const hm = line.match(/^(#{1,6}) (.+)$/);
    if (hm) {
      if (hm[1].length === 1 && /^(?:\d+\. |Appendix [A-E])/.test(hm[2])) section = hm[2];
      if (/^Phase \d+[A-Z]? —/.test(hm[2])) phase = hm[2].match(/^Phase (\d+[A-Z]?)/)[1];
      if (section !== '21. Roadmap') phase = null;
      headings.push({file, line: i + 1, title: hm[2], section, phase});
      continue;
    }
    if (!line.trim() || /^<a id="[^"]+"><\/a>$/.test(line) || /^\s*(?:---+|\*\*\*+)\s*$/.test(line)) continue;
    if (original && i >= 19 && i <= 59) continue; // The old Contents/quick navigation is superseded by domain TOCs.
    if (/\|(?:\s*:?-+:?\s*\|)+/.test(line) && !line.replace(/[|:\-\s]/g, '')) continue; // Table rule syntax, not content.
    const kind = /^\|/.test(line) ? 'table row' : /^\s*(?:[-*+] |\d+\. )/.test(line) ? 'list item' : 'prose';
    records.push({file, line: i + 1, text: line.trim(), canonical: canonical(line, file), section, phase, kind});
  }
  if (fence) throw new Error(`Unclosed fence in ${file}`);
  return {records, headings};
}
const old = scan(source, 'DUDE_PRD.md', true);
const current = targets.flatMap(target => scan(target.text, target.file).records);
const available = new Map();
for (const row of current) {
  const group = available.get(row.canonical) ?? [];
  group.push(row);
  available.set(row.canonical, group);
}
const missing = [], matches = [];
for (const row of old.records) {
  const candidates = available.get(row.canonical) ?? [];
  if (candidates.length) {
    const found = candidates.shift();
    matches.push({...row, target: {file: found.file, line: found.line}, exact: row.text === found.text});
  } else missing.push(row);
}

const sourceTokens = md.parse(source, {});
const currentTokens = targets.flatMap(target => md.parse(target.text, {}).map(token => ({...token, file: target.file})));
const codeBlocks = sourceTokens.filter(t => t.type === 'fence' || t.type === 'code_block');
const codeAvailable = new Map();
for (const token of currentTokens.filter(t => t.type === 'fence' || t.type === 'code_block')) {
  const key = hash(`${token.info}\n${token.content}`);
  const group = codeAvailable.get(key) ?? [];
  group.push({file: token.file, line: token.map[0] + 1});
  codeAvailable.set(key, group);
}
const codeMissing = [];
const codeMatches = codeBlocks.map(token => {
  const key = hash(`${token.info}\n${token.content}`);
  const found = codeAvailable.get(key)?.shift();
  if (!found) codeMissing.push({line: token.map[0] + 1, language: token.info, hash: key});
  return {line: token.map[0] + 1, language: token.info, hash: key, target: found};
});

const counts = {};
for (const row of old.records) {
  const found = counts[row.section] ?? {total: 0, exact: 0, navigationChanged: 0, missing: 0, prose: 0, lists: 0, tables: 0};
  found.total++;
  found[row.kind === 'table row' ? 'tables' : row.kind === 'list item' ? 'lists' : 'prose']++;
  counts[row.section] = found;
}
for (const row of matches) counts[row.section][row.exact ? 'exact' : 'navigationChanged']++;
for (const row of missing) counts[row.section].missing++;

const summary = {
  baseline, sourceSha256: hash(source), files, sourceLines: source.split('\n').length,
  sourceHeadings: old.headings.length, sourceContentRecords: old.records.length,
  exactMatches: matches.filter(r => r.exact).length, navigationOnlyMatches: matches.filter(r => !r.exact).length,
  missingCount: missing.length, codeBlocks: codeBlocks.length, missingCodeBlocks: codeMissing.length,
  counts, missing, codeMissing,
};

// Verify that each original heading's immediate prose/list/table content remains
// contiguous inside a current heading body, rather than merely somewhere in a bag
// of matching lines. Accessibility is the single intentional two-document split.
const sourceUnits = old.headings.filter(h => h.line >= 66).map(h => {
  const next = old.headings.find(n => n.line > h.line)?.line ?? source.split('\n').length + 1;
  return {...h, body: old.records.filter(r => r.line > h.line && r.line < next)};
});
const targetUnits = targets.flatMap(target => {
  const scanResult = scan(target.text, target.file);
  return scanResult.headings.map((heading, index) => {
    const next = scanResult.headings[index + 1]?.line ?? target.text.split('\n').length + 1;
    return {...heading, body: scanResult.records.filter(r => r.line > heading.line && r.line < next)};
  });
});
const unitResults = sourceUnits.map(unit => {
  if (!unit.body.length) return {...unit, body: undefined, result: 'No prose/list/table records', destinations: []};
  const expected = unit.body.map(r => r.canonical).join('\n');
  const candidates = targetUnits.filter(target => target.body.map(r => r.canonical).join('\n').includes(expected));
  return {line: unit.line, title: unit.title, section: unit.section, phase: unit.phase, bodyRecords: unit.body.length,
    result: candidates.length ? 'Contiguous body preserved' : 'Needs split/context review',
    destinations: candidates.map(c => ({file: c.file, line: c.line, title: c.title}))};
});
const contextsToReview = unitResults.filter(r => r.result === 'Needs split/context review');

// Table integrity is checked independently, including row order, headers,
// column separators and all cell values after navigation-only normalization.
const tableAvailable = new Map();
for (const target of targets) {
  for (const token of md.parse(target.text, {}).filter(t => t.type === 'table_open')) {
    const key = target.text.split('\n').slice(...token.map).map(line => canonical(line, target.file)).join('\n');
    const group = tableAvailable.get(key) ?? [];
    group.push({file: target.file, line: token.map[0] + 1});
    tableAvailable.set(key, group);
  }
}
const tableResults = sourceTokens.filter(t => t.type === 'table_open').map(token => {
  const key = source.split('\n').slice(...token.map).map(line => canonical(line, 'DUDE_PRD.md')).join('\n');
  const found = tableAvailable.get(key)?.shift();
  return {line: token.map[0] + 1, rows: token.map[1] - token.map[0], preserved: !!found, target: found};
});
const phaseStatusResults = sourceUnits.filter(u => /^Phase \d+ —/.test(u.title) && u.title.endsWith(')')).map(unit => {
  const match = unit.title.match(/^(Phase \d+ — .+?) \((.+)\)$/);
  if (!match) throw new Error(`Unrecognized completed phase annotation: ${unit.title}`);
  const status = `**Status:** ${match[2]}`;
  const target = targetUnits.find(u => u.title === match[1]);
  return {line: unit.line, phase: unit.phase, annotation: match[2], exactStatusRetained: !!target && target.body.some(r => r.text === status), target: target?.file};
});
summary.sourceBodyUnits = sourceUnits.length;
summary.contextReviewCount = contextsToReview.length;
summary.phaseStatusAnnotations = phaseStatusResults.length;
summary.missingStatusAnnotations = phaseStatusResults.filter(r => !r.exactStatusRetained).length;
summary.sourceTables = tableResults.length;
summary.missingOrAlteredTables = tableResults.filter(r => !r.preserved).length;

const slug = value => value.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
const anchorIds = new Map();
for (const heading of old.headings) {
  const numbered = heading.title.match(/^(\d+(?:\.\d+)*|[CDE]\.\d+)\.?\s+(.+)$/);
  if (numbered) anchorIds.set(slug(numbered[2]), numbered[1]);
}
const renamedAnchors = {
  'product-summary': '1', 'delivered-baseline-through-phase-31': '1.1',
  'scope-evolution-and-deferred-capabilities': '5', 'product-surfaces': '7', 'mobile-shell': '7.5.1',
  'appearance-system': '8', 'standalone-web-delivery-and-routing': '10', 'offline-behaviour': '11',
  'persistence-policy': '14', 'synchronization-protocol': '14.7', 'accessibility': '19',
  'roadmap-direction': '21', 'delivered-repository-architecture': '23', 'future-remote-execution': '25.11',
  'home-and-deck-requirements': '27', 'security-boundaries': '31', 'trust-boundaries': '31.2',
  'historical-v1-definition-of-done': '35', 'a-extension-speed': '3.1.A',
};
for (const [anchor, id] of Object.entries(renamedAnchors)) anchorIds.set(anchor, id);

function originalRefs(line) {
  const found = [];
  let remaining = line.replace(/§21\s+Phase (\d+[A-Z]?)/g, (_m, phase) => { found.push({at: line.indexOf(_m), id: `Phase ${phase}`}); return ' '.repeat(_m.length); });
  remaining = remaining.replace(/Appendix ([A-E])(?:\s+§([A-E]\.\d+))?/g, (_m, appendix, subsection, at) => { found.push({at, id: subsection ?? `Appendix ${appendix}`}); return ' '.repeat(_m.length); });
  remaining = remaining.replace(/§§(\d+(?:\.\d+)*(?:,?\s+(?:and\s+)?\d+(?:\.\d+)*)*)/g, (_m, numbers, at) => {
    for (const n of numbers.matchAll(/\d+(?:\.\d+)*/g)) found.push({at: at + n.index, id: n[0]});
    return ' '.repeat(_m.length);
  });
  for (const match of remaining.matchAll(/(?:§|Sections?\s+)(\d+(?:\.\d+)*(?:\.[A-Z])?)(?!\w|\.\d)/g)) found.push({at: match.index, id: match[1]});
  return found.sort((a, b) => a.at - b.at).map(r => r.id);
}
function currentRefs(line, from) {
  const refs = [];
  for (const match of line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    const [file, anchor] = match[2].split('#');
    const resolved = file ? path.posix.normalize(path.posix.join(path.posix.dirname(from), file)) : from;
    if (!files.includes(resolved) || !anchor) continue;
    if (appendixAnchors[anchor]) refs.push(`Appendix ${appendixAnchors[anchor]}`);
    else if (/^phase-\d+[a-z]?$/.test(anchor)) refs.push(`Phase ${anchor.slice(6).toUpperCase()}`);
    else refs.push(anchorIds.get(anchor) ?? `UNKNOWN:${anchor}`);
  }
  return refs;
}
const refResults = matches.filter(r => !r.exact).map(row => {
  const target = targets.find(t => t.file === row.target.file).text.split('\n')[row.target.line - 1];
  const before = originalRefs(row.text);
  const after = currentRefs(target, row.target.file);
  return {line: row.line, target: row.target, before, after, preserved: JSON.stringify(before) === JSON.stringify(after)};
});
summary.referenceRows = refResults.length;
summary.changedReferenceDestinations = refResults.filter(r => !r.preserved).length;

// Heading text changes must be explicit structural renames, not discarded
// phase labels or annotations. The two headings retained as anchors are also checked.
const headingRenames = {
  '1': 'Product Summary', '1.1': 'Delivered Baseline through Phase 31',
  '5': 'Scope Evolution and Deferred Capabilities', '7': 'Product Surfaces', '7.5.1': 'Mobile Shell',
  '8': 'Appearance System', '10': 'Standalone Web Delivery and Routing', '11': 'Offline Behaviour',
  '14': 'Persistence Policy', '14.7': 'Synchronization Protocol', '19': 'Accessibility',
  '21': 'Roadmap Direction', '23': 'Delivered Repository Architecture', '25.11': 'Future Remote Execution',
  '27': 'Home and Deck Requirements', '31.2': 'Trust Boundaries', '35': 'Historical V1 Definition of Done',
};
const headingResults = sourceUnits.map(unit => {
  const numbered = unit.title.match(/^(\d+(?:\.\d+)*|[CDE]\.\d+)\.?\s+(.+)$/);
  let expected = numbered ? headingRenames[numbered[1]] ?? numbered[2] : unit.title;
  expected = expected.replace(/^Appendix [A-E] — /, '');
  if (/^Phase \d+ —/.test(expected)) expected = expected.replace(/ \(.+\)$/, '');
  const titleKey = canonical(expected, 'DUDE_PRD.md').toLowerCase();
  const candidates = targetUnits.filter(u => canonical(u.title, u.file).toLowerCase() === titleKey);
  const anchorOnly = ['2', '4'].includes(numbered?.[1]) && targets.some(t => t.text.includes(`<a id="${slug(expected)}"></a>`));
  return {line: unit.line, original: unit.title, expected, preserved: candidates.length > 0 || anchorOnly,
    renamed: expected !== unit.title.replace(/^(?:\d+(?:\.\d+)*|[CDE]\.\d+)\.?\s+/, '').replace(/^Appendix [A-E] — /, ''),
    targets: candidates.map(c => ({file: c.file, line: c.line, title: c.title})), anchorOnly};
});
summary.missingHeadingOrPhaseDetails = headingResults.filter(r => !r.preserved).length;

// Build the line trace from matching subsection bodies, so repeated labels such
// as "Example:" cannot be attributed to an unrelated document. The earlier
// multiset comparison remains the independent duplicate-occurrence check.
const scopedMatches = [], usedDestinationRows = new Set();
function mapFragment(rows, candidates, label) {
  const expected = rows.map(r => r.canonical);
  if (!expected.length) return;
  for (const candidate of candidates) {
    for (let offset = 0; offset <= candidate.body.length - expected.length; offset++) {
      const slice = candidate.body.slice(offset, offset + expected.length);
      if (!slice.every((r, i) => r.canonical === expected[i] && !usedDestinationRows.has(`${r.file}:${r.line}`))) continue;
      rows.forEach((row, i) => {
        const target = slice[i];
        usedDestinationRows.add(`${target.file}:${target.line}`);
        scopedMatches.push({...row, target: {file: target.file, line: target.line}, exact: row.text === target.text});
      });
      return;
    }
  }
  throw new Error(`Unable to map contiguous fragment: ${label}`);
}
for (const unit of sourceUnits) {
  if (!unit.body.length || unit.title === '19. Accessibility Baseline') continue;
  const expectedHeading = headingResults.find(r => r.line === unit.line);
  const candidateInfo = unitResults.find(r => r.line === unit.line).destinations;
  let candidates = targetUnits.filter(t => candidateInfo.some(c => c.file === t.file && c.line === t.line));
  const sameTitle = candidates.filter(t => canonical(t.title, t.file).toLowerCase() === canonical(expectedHeading.expected, 'DUDE_PRD.md').toLowerCase());
  if (sameTitle.length) candidates = sameTitle;
  if (unit.phase) candidates.sort((a, b) => {
    const parentPhase = target => targetUnits.filter(h => h.file === target.file && h.line <= target.line && /^Phase \d+[A-Z]? —/.test(h.title)).at(-1)?.title.match(/^Phase (\d+[A-Z]?)/)[1];
    return Number(parentPhase(b) === unit.phase) - Number(parentPhase(a) === unit.phase);
  });
  mapFragment(unit.body, candidates, unit.title);
}
mapFragment(old.records.filter(r => r.section === 'Front matter'), targetUnits.filter(t => t.title === 'Original Consolidated PRD Header'), 'Front matter');

const accessibilitySource = sourceUnits.find(u => u.title === '19. Accessibility Baseline');
const contrastStart = accessibilitySource.body.findIndex(r => r.text.startsWith('Contrast thresholds,'));
const certificationStart = accessibilitySource.body.findIndex(r => r.text.startsWith('Formal accessibility certification'));
const accessibilityFragments = [
  {file: 'docs/product/UX_SPEC.md', title: 'Accessibility', records: [...accessibilitySource.body.slice(0, contrastStart), ...accessibilitySource.body.slice(certificationStart)]},
  {file: 'docs/delivery/QUALITY_AND_RELEASE.md', title: 'Accessibility Gates', records: accessibilitySource.body.slice(contrastStart, certificationStart)},
].map(fragment => {
  const target = targetUnits.find(u => u.file === fragment.file && u.title === fragment.title);
  const expected = fragment.records.map(r => r.canonical).join('\n');
  return {file: fragment.file, title: fragment.title, sourceRecords: fragment.records.length, line: target?.line,
    preserved: !!target && target.body.map(r => r.canonical).join('\n').includes(expected)};
});
mapFragment([...accessibilitySource.body.slice(0, contrastStart), ...accessibilitySource.body.slice(certificationStart)],
  targetUnits.filter(t => t.file === 'docs/product/UX_SPEC.md' && t.title === 'Accessibility'), 'Accessibility UX fragment');
mapFragment(accessibilitySource.body.slice(contrastStart, certificationStart),
  targetUnits.filter(t => t.file === 'docs/delivery/QUALITY_AND_RELEASE.md' && t.title === 'Accessibility Gates'), 'Accessibility acceptance fragment');
if (scopedMatches.length !== old.records.length) throw new Error('Subsection line trace is incomplete');
matches.splice(0, matches.length, ...scopedMatches.sort((a, b) => a.line - b.line));
refResults.splice(0, refResults.length, ...matches.filter(r => !r.exact).map(row => {
  const target = targets.find(t => t.file === row.target.file).text.split('\n')[row.target.line - 1];
  const before = originalRefs(row.text), after = currentRefs(target, row.target.file);
  return {line: row.line, target: row.target, before, after, preserved: JSON.stringify(before) === JSON.stringify(after)};
}));
summary.exactMatches = matches.filter(r => r.exact).length;
summary.navigationOnlyMatches = matches.filter(r => !r.exact).length;
summary.referenceRows = refResults.length;
summary.changedReferenceDestinations = refResults.filter(r => !r.preserved).length;
for (const count of Object.values(counts)) { count.exact = 0; count.navigationChanged = 0; }
for (const row of matches) counts[row.section][row.exact ? 'exact' : 'navigationChanged']++;
summary.intentionalSplitSubsections = 1;
summary.unresolvedContextReviews = contextsToReview.length - (accessibilityFragments.every(r => r.preserved) ? 1 : 0);

// List indentation carries hierarchy and is verified without whitespace normalization.
const indentationResults = matches.filter(r => r.kind === 'list item').map(row => {
  const sourceLine = source.split('\n')[row.line - 1];
  const targetLine = targets.find(t => t.file === row.target.file).text.split('\n')[row.target.line - 1];
  return {line: row.line, target: row.target, preserved: sourceLine.match(/^\s*/)[0] === targetLine.match(/^\s*/)[0]};
});
summary.listItems = indentationResults.length;
summary.listIndentationChanges = indentationResults.filter(r => !r.preserved).length;
summary.uniqueDestinationRecords = usedDestinationRows.size;

function blockContext(row) {
  const sourceHeading = old.headings.filter(h => h.line < row.line).at(-1);
  const expected = headingResults.find(h => h.line === sourceHeading.line)?.expected;
  const targetHeading = targetUnits.filter(h => h.file === row.target?.file && h.line < row.target.line).at(-1);
  return {sourceLine: row.line, originalHeading: sourceHeading.title, target: row.target,
    targetHeading: targetHeading?.title, preserved: !!expected && !!targetHeading &&
      canonical(expected, 'DUDE_PRD.md').toLowerCase() === canonical(targetHeading.title, targetHeading.file).toLowerCase()};
}
const codeContextResults = codeMatches.map(blockContext);
const tableContextResults = tableResults.map(blockContext);
summary.codeContextChanges = codeContextResults.filter(r => !r.preserved).length;
summary.tableContextChanges = tableContextResults.filter(r => !r.preserved).length;
summary.openingRestoredVerbatim = targets.find(t => t.file === 'docs/history/DECISION_LOG.md').text.includes(source.split('\n').slice(4, 18).join('\n'));
fs.mkdirSync('tmp/prd-audit', {recursive: true});
fs.writeFileSync('tmp/prd-audit/original.md', source);
fs.writeFileSync('tmp/prd-audit/results.json', JSON.stringify({summary, matches, codeMatches, sourceHeadings: old.headings, unitResults, phaseStatusResults, tableResults, refResults, headingResults, accessibilityFragments, indentationResults, codeContextResults, tableContextResults}, null, 2));
console.log(JSON.stringify({...summary, missing: undefined, counts: undefined, files: undefined}));
for (const row of missing) console.log(`UNMATCHED ${row.line} (${row.section}, ${row.kind}): ${row.text}`);
for (const row of codeMissing) console.log(`MISSING CODE ${row.line}: ${row.language}`);
for (const unit of contextsToReview) console.log(`CONTEXT REVIEW ${unit.line} (${unit.title}): ${unit.bodyRecords} body records`);
for (const row of refResults.filter(r => !r.preserved)) console.log(`REFERENCE REVIEW ${row.line}: ${JSON.stringify(row.before)} -> ${JSON.stringify(row.after)}`);
for (const row of headingResults.filter(r => !r.preserved)) console.log(`HEADING REVIEW ${row.line}: ${row.original} -> ${row.expected}`);
for (const row of codeContextResults.filter(r => !r.preserved)) console.log(`CODE CONTEXT REVIEW ${row.sourceLine}: ${row.originalHeading} -> ${row.targetHeading}`);
for (const row of tableContextResults.filter(r => !r.preserved)) console.log(`TABLE CONTEXT REVIEW ${row.sourceLine}: ${row.originalHeading} -> ${row.targetHeading}`);
const failedCounts = ['missingCount', 'missingCodeBlocks', 'missingOrAlteredTables', 'missingStatusAnnotations', 'changedReferenceDestinations', 'missingHeadingOrPhaseDetails', 'unresolvedContextReviews', 'listIndentationChanges', 'codeContextChanges', 'tableContextChanges'];
if (failedCounts.some(key => summary[key] !== 0) || !summary.openingRestoredVerbatim) process.exitCode = 1;
