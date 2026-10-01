import fs from 'node:fs';

const source = fs.readFileSync('tmp/prd-audit/original.md', 'utf8');
const file = 'docs/history/DECISION_LOG.md';
const heading = '## Original Consolidated PRD Header';
let current = fs.readFileSync(file, 'utf8');
if (current.includes(heading)) throw new Error('Original header already present; inspect before changing');
const originalOpening = source.split('\n').slice(4, 18).join('\n');
current = current.replace(
  '- [Reconciliation Decisions and Requirement Traceability](#reconciliation-decisions-and-requirement-traceability)\n',
  '- [Reconciliation Decisions and Requirement Traceability](#reconciliation-decisions-and-requirement-traceability)\n- [Original Consolidated PRD Header](#original-consolidated-prd-header)\n',
);
current += `\n${heading}\n\nThe original opening metadata and consolidation note are reproduced verbatim below, from the pre-split PRD at commit \`b51fd71b785aea04774ab5d6decffc1bbf366c9a\` (lines 5–18). This preserves source wording that the first split condensed. Its references to the unified document and global sections describe the former layout; the [root compatibility index](../../DUDE_PRD.md#legacy-section-index) resolves those references. Current authority remains with the [master PRD](../DUDE_PRD.md).\n\n${originalOpening}\n`;
fs.writeFileSync(file, current);
console.log('Restored all 12 unmatched opening entries verbatim in Decision Log.');
