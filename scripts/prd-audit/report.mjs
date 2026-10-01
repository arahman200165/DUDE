import fs from 'node:fs';
import path from 'node:path';

const audit = JSON.parse(fs.readFileSync('tmp/prd-audit/results.json', 'utf8'));
const s = audit.summary;
if (s.missingCount || s.missingCodeBlocks || s.missingOrAlteredTables || s.changedReferenceDestinations || s.unresolvedContextReviews) throw new Error('Audit has unresolved findings');
const from = 'docs/history/PRD_SPLIT_AUDIT.md';
const targetLink = (file, line, label = path.posix.basename(file)) => `[${label}](${path.posix.relative(path.posix.dirname(from), file)}${line ? `#L${line}` : ''})`;
const docLink = (file, anchor, label) => `[${label}](${path.posix.relative(path.posix.dirname(from), file)}${anchor ? `#${anchor}` : ''})`;
const sections = Object.entries(s.counts).map(([section, c]) => {
  const destinations = [...new Set(audit.matches.filter(r => r.section === section).map(r => r.target.file))];
  const codeDestinations = audit.codeContextResults.filter(r => audit.sourceHeadings.find(h => h.title === r.originalHeading)?.section === section).map(r => r.target.file);
  for (const file of codeDestinations) if (!destinations.includes(file)) destinations.push(file);
  return `| ${section} | ${c.total} | ${c.exact} | ${c.navigationChanged} | ${c.missing} | ${destinations.map(file => docLink(file, '', path.posix.basename(file))).join(', ')} |`;
});

const report = `# PRD Split — Content Preservation Audit

Audited against the original 8,109-line \`DUDE_PRD.md\` in commit \`${s.baseline}\`. The comparison reads the original directly from Git, independently of the extraction script and its prior coverage claims. It compares that source with the ten split specifications in the working tree.

**Result after corrections: no original prose, list item, table content, code example or phase completion detail remains missing.** The first split was not fully lossless: twelve opening entries were condensed, and one subsection-specific reference was broadened. Both findings are corrected below.

## Findings and Corrections

1. **Original opening block omitted as a complete record.** The first check started at the numbered sections and missed original lines 5–18. Ten metadata entries, the resources entry and the consolidation note had been summarized or dispersed. Their full wording is now restored **verbatim**, including audience, platform targets, Phase 100 horizon, priorities, status convention and source resources, in ${docLink('docs/history/DECISION_LOG.md', 'original-consolidated-prd-header', 'Original Consolidated PRD Header')}. The restored block is checked as an exact substring of the original, including its Markdown formatting.
2. **Appendix subsection pointer broadened.** Original line 649 referred specifically to Appendix D §D.1. The split linked to its parent Commercialization Context heading. ${docLink('docs/history/DELIVERY_HISTORY.md', 'historical-amendments-preserved', 'The historical amendment')} now links directly to ${docLink('docs/history/DECISION_LOG.md', 'non-authoritative-monetization-sketch', 'Non-authoritative monetization sketch')}, retaining the original specificity. The underlying sentence was already present.

My earlier preservation check covered extracted heading/body units and code examples; it did not independently account for the original opening block. This audit closes that gap.

## Complete Comparison Results

| Check | Original material checked | Result |
|---|---:|---|
| Prose, list items and table rows | ${s.sourceContentRecords.toLocaleString('en-US')} content records | 0 missing |
| Exact textual matches | ${s.exactMatches.toLocaleString('en-US')} records | Same text after trimming surrounding whitespace |
| Cross-reference-only changes | ${s.navigationOnlyMatches} records | Other words, punctuation, values, list numbers and checkbox states unchanged |
| Rewritten reference destinations | ${s.referenceRows} changed records | Original section, phase or appendix-subsection identities retained |
| Original numbered-section/subsection and appendix headings | ${s.sourceBodyUnits} | Mapped to retained titles, declared structural renames or retained anchors |
| List hierarchy | ${s.listItems.toLocaleString('en-US')} list items | Leading indentation unchanged |
| Complete original tables | ${s.sourceTables} | Headers, column separators, row order and cell values preserved; only reference syntax normalized |
| Original code/example blocks | ${s.codeBlocks} | Language labels and content identical after LF/CRLF normalization |
| Code and table placement | ${s.codeBlocks + s.sourceTables} blocks | Remain under the corresponding original subject, accounting for heading renames |
| Completed Phase 0–31 heading annotations | ${s.phaseStatusAnnotations} | Complete original wording retained in the corresponding phase's Status line |
| Subsection continuity | 466 prose/list/table bodies | Retained together in the corresponding current heading body |
| Intentionally split subsection | 1: Accessibility | All 23 original content records accounted for across UX and release gates |

The 493 heading units include 26 units with no ordinary prose/list/table records; any fenced examples beneath those headings are covered by the separate code checks. The document title, master-document subtitle, old Contents list, blank lines, horizontal separators and explicit navigation anchors are structural material, not counted as content records.

## Method and Limits

- The content comparison preserves duplicate occurrences. Finding one instance of a repeated sentence does not satisfy every original occurrence.
- Navigation normalization only recognizes original section references, their replacement document links, phase references and appendix references. It does not discard ordinary numbers, dates, milestone IDs, measurements, tool names, qualifiers, list labels or requirement text.
- Reference destinations are checked separately, so changing a pointer cannot pass merely because its syntax is normalized.
- Whole tables are compared in order, not just as individual rows. Code/example blocks are hashed with their language labels, and their heading context is checked separately.
- The original heading bodies are checked as contiguous content within current heading bodies. Accessibility is reviewed explicitly as two retained fragments: 16 UX records and 7 acceptance records.
- This is a document-preservation audit. Historical implementation claims and test results remain historical; this audit does not assert a new runtime verification of DUDE.

The exact LF-normalized source SHA-256 is \`${s.sourceSha256}\`.

## Changes That Were Reorganization or Additions

The split was not a byte-for-byte file move. Global section numbers were removed from prose headings, headings were retitled or moved, completed phase annotations moved into Status lines, and the old Contents list was replaced by per-document navigation. Phase and milestone identifiers remain intact.

The master overview, authority order, document ownership descriptions, completed-phase roadmap summaries, decision index, functional overviews and domain/category map also include new connective summaries. They were additions, not replacements for the full original requirements or delivered inventories. This audit does not present those additions as verbatim source material.

The complete Phase 0–31 narratives remain in ${docLink('docs/history/DELIVERY_HISTORY.md', '', 'Delivery History')}; all planned Phase 31A–31J and Phase 32–100 detail remains in ${docLink('docs/delivery/ROADMAP.md', '', 'Roadmap')}. All five original appendices remain in ${docLink('docs/history/DECISION_LOG.md', '', 'Decision Log')}.

## Section-by-Section Accounting

“Records” means original nonblank prose lines, list items and table rows outside fenced code. Table rule lines and headings are checked separately. “Reference changes” means that only cross-reference syntax differs. Counts do not include the new overview/navigation material.

| Original section | Records | Text unchanged | Reference changes | Missing | Current destination(s) |
|---|---:|---:|---:|---:|---|
${sections.join('\n')}

## Accessibility Split

${docLink('docs/product/UX_SPEC.md', 'accessibility', 'UX Specification → Accessibility')} retains keyboard reachability, visible focus, semantic controls, labels, keyboard dismissal, understandable navigation, non-color cues, high contrast, forced colors, reduced motion, color-blind-safe choices and the certification scope limit.

${docLink('docs/delivery/QUALITY_AND_RELEASE.md', 'accessibility-gates', 'Quality and Release → Accessibility Gates')} retains all five numeric contrast/separation requirements and the complete Playwright acceptance paragraph: 864 appearance combinations, the 108-combination layout matrix and all three tested viewport sizes. Nothing in the original accessibility requirements was dropped.

## Local Audit Evidence

The full original-line → destination-file/line trace, code hashes, whole-table matches, heading checks, reference checks and per-phase status checks are in \`tmp/prd-audit/results.json\`. The repeatable checker is \`tmp/prd-audit/audit.mjs\` and pins the original commit above. These are local, Git-ignored audit artifacts; this report is the retained repository record.
`;
fs.writeFileSync(from, report);
console.log(`Wrote ${from}: ${report.split('\n').length} lines.`);
