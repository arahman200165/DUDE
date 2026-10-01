import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';

const audit = JSON.parse(fs.readFileSync('tmp/prd-audit/results.json', 'utf8'));
const files = [...audit.summary.files, 'docs/history/PRD_SPLIT_AUDIT.md', 'DUDE_PRD.md', 'AGENTS.md', 'README.md', 'ADDING_A_TOOL.md', 'docs/SECURITY.md'];
const md = new MarkdownIt({html: true});
const cache = new Map(), errors = [];
const slug = value => value.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
function read(file) {
  if (cache.has(file)) return cache.get(file);
  const text = fs.readFileSync(file, 'utf8');
  const tokens = md.parse(text, {}), ids = new Set(), counts = new Map(), links = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open') {
      const title = tokens[i + 1].children.filter(c => c.type === 'text' || c.type === 'code_inline').map(c => c.content).join('');
      const base = slug(title), n = counts.get(base) ?? 0;
      counts.set(base, n + 1);
      ids.add(n ? `${base}-${n}` : base);
    }
    if (token.type === 'html_block' || token.type === 'inline') for (const match of token.content.matchAll(/<a id="([^"]+)"/g)) ids.add(match[1]);
    if (token.type === 'inline') for (const child of token.children ?? []) {
      if (child.type === 'link_open') links.push(child.attrGet('href'));
      if (child.type === 'image') links.push(child.attrGet('src'));
    }
  }
  const result = {ids, links}; cache.set(file, result); return result;
}
let checked = 0;
for (const file of files) for (const href of read(file).links) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
  checked++;
  const [relative, anchor] = href.split('#');
  const target = relative ? path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(relative))) : file;
  if (!fs.existsSync(target)) errors.push(`${file}: missing file ${href}`);
  else if (anchor && target.endsWith('.md') && !read(target).ids.has(decodeURIComponent(anchor))) errors.push(`${file}: missing anchor ${href}`);
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`PASS: ${checked} local Markdown file/anchor links, including the restored header and audit report.`);
