// Builds .phase23/ledger.json for Phase 23 / Tier 5 (DUDE_PRD.md §21): every tool manifest not
// yet `status: 'verified'`, tagged with a category/subdomain and a recipe heuristic (see
// .phase23/RECIPE.md for what each recipe means). Heuristics only — a human/worker glance at the
// actual source still decides the final recipe per ADDING_A_TOOL conventions.
//
// Usage: node scripts/phase23-queue.mjs

import { readdirSync, statSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'apps/web/src/app/tools');
const OUT_DIR = path.join(ROOT, '.phase23');
const OUT_FILE = path.join(OUT_DIR, 'ledger.json');

function findToolDirs() {
  return readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function readManifest(id) {
  const p = path.join(TOOLS_DIR, id, `${id}.manifest.ts`);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

function field(src, name) {
  const m = src.match(new RegExp(`${name}:\\s*'([^']+)'`));
  return m ? m[1] : undefined;
}

function keywords(src) {
  const m = src.match(/keywords:\s*\[([^\]]*)\]/s);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

// Only the pure transform file(s) matter for the CORE-ONLY heuristic — per ADDING_A_TOOL.md the
// Angular component (`<id>.ts`) legitimately touches DOM/clipboard/etc. even when its underlying
// logic is pure, so it's excluded here to avoid false positives.
function collectLogicFiles(id) {
  const dir = path.join(TOOLS_DIR, id);
  const componentFile = `${id}.ts`;
  const files = readdirSync(dir, { withFileTypes: true })
    .filter(
      (e) =>
        e.isFile() &&
        e.name.endsWith('.ts') &&
        !e.name.endsWith('.spec.ts') &&
        !e.name.endsWith('.manifest.ts') &&
        e.name !== componentFile,
    )
    .map((e) => path.join(dir, e.name));
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}

const BROWSER_API_RE = /\b(FileReader|navigator\.|document\.|window\.|new Image\(|HTMLCanvasElement|getContext\(|IntersectionObserver|ResizeObserver|MediaRecorder|localStorage|indexedDB)\b/;
const GENERATOR_ID_RE = /generat|random|uuid|ulid|nanoid|qr-code|barcode|gradient|palette|favicon|placeholder|mock|dummy|lorem/i;
const ROUNDTRIP_ID_RE = /encode|decode|convert|converter|codec|base32|base64|url-encod|escape|unescape|serializ|pars|format|beautif|minif|pretty|transform|translat|case-|slug/i;
const CROSSCHECK_CATEGORIES = new Set(['security']);

const DEV_SUBDOMAIN_RULES = [
  ['css-generators', /css|gradient|shadow|flexbox|grid|animation|easing|clip-path|filter|palette|color-scheme/i],
  ['network-ip', /ip-|ip\d|cidr|subnet|dns|mac-address|user-agent|http-status|mime|port-|url-|network/i],
  ['id-generators', /uuid|ulid|nanoid|snowflake|id-generator|object-id/i],
  ['git-docker-k8s', /git-|docker|k8s|kubernetes|kubeconfig|helm|compose|dockerfile/i],
  ['math', /math|matrix|vector|number|unit-convert|base-convert|statistic|equation/i],
  ['regex', /regex|regexp/i],
];

function classifyDeveloperSubdomain(id, kws) {
  const haystack = `${id} ${kws.join(' ')}`;
  for (const [name, re] of DEV_SUBDOMAIN_RULES) {
    if (re.test(haystack)) return name;
  }
  return 'misc';
}

function classifyRecipe({ id, category, kws, src }) {
  if (CROSSCHECK_CATEGORIES.has(category)) return 'CROSSCHECK';

  const hasFileIO = /io:\s*\{[^}]*accepts:\s*\[[^\]]*'(file|image)'/s.test(src.manifest);
  const usesBrowserApi = BROWSER_API_RE.test(src.logic);
  if (hasFileIO || usesBrowserApi) return 'CORE-ONLY';

  const haystack = `${id} ${kws.join(' ')}`;
  if (GENERATOR_ID_RE.test(haystack)) return 'GENERATOR';
  if (ROUNDTRIP_ID_RE.test(haystack)) return 'ROUNDTRIP';
  return 'FUZZ';
}

const CATEGORY_ORDER = ['encoding', 'text', 'date-time', 'security', 'web', 'documents', 'data', 'developer'];

const entries = [];
for (const id of findToolDirs()) {
  const manifestSrc = readManifest(id);
  if (!manifestSrc) continue;
  const status = field(manifestSrc, 'status') ?? 'stable';
  if (status === 'verified') continue;

  const category = field(manifestSrc, 'category');
  const kws = keywords(manifestSrc);
  const logicSrc = collectLogicFiles(id);
  const recipe = classifyRecipe({ id, category, kws, src: { manifest: manifestSrc, logic: logicSrc } });
  const subdomain = category === 'developer' ? classifyDeveloperSubdomain(id, kws) : null;

  entries.push({
    id,
    category,
    subdomain,
    status: 'pending',
    recipe,
    milestone: null,
    notes: '',
  });
}

entries.sort((a, b) => {
  const ca = CATEGORY_ORDER.indexOf(a.category);
  const cb = CATEGORY_ORDER.indexOf(b.category);
  if (ca !== cb) return ca - cb;
  const sa = a.subdomain ?? '';
  const sb = b.subdomain ?? '';
  if (sa !== sb) return sa.localeCompare(sb);
  return a.id.localeCompare(b.id);
});

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(entries, null, 2) + '\n', 'utf8');

const byRecipe = entries.reduce((acc, e) => ((acc[e.recipe] = (acc[e.recipe] ?? 0) + 1), acc), {});
console.log(`Wrote ${entries.length} entries to ${path.relative(ROOT, OUT_FILE)}`);
console.log('By recipe:', byRecipe);
