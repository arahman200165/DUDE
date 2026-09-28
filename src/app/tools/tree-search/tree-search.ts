import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PlanPreview, WalkOptions } from '../../../shared-logic/fs/fs-types';
import type { LineMatch } from '../../../shared-logic/fs/text-search';
import { DEFAULT_WALK_OPTIONS } from '../../../shared-logic/fs/walk-filter';
import { formatBytes } from '../../../shared-logic/fs/format-size';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FsRootPicker } from '../../shared/components/fs-root-picker/fs-root-picker';
import { WalkOptionsPanel } from '../../shared/components/walk-options/walk-options';
import { ScanProgress } from '../../shared/components/scan-progress/scan-progress';
import { MutationPreview } from '../../shared/components/mutation-preview/mutation-preview';
import { PlatformService } from '../../core/platform/platform.service';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { FsJobService, type FsJobHandle } from '../../core/platform/fs-job.service';
import { downloadFile } from '../../shared/utils/download-file';
import { evaluateQuery } from '../json-query/json-query-eval';
import { evaluateYamlPath } from '../yaml-path/yaml-path-eval';
import { evaluateXPath } from '../xml-xpath/xml-xpath-eval';

const TOOL_ID = 'tree-search';
type Mode = 'content' | 'metadata' | 'structured';
type Structured = 'json-jsonpath' | 'json-jmespath' | 'yaml-jsonpath' | 'yaml-jmespath' | 'xml-xpath';
interface ContentHit { readonly path: string; readonly size: number; readonly encoding: string; readonly total: number; readonly matches: readonly LineMatch[] }
interface ContentSummary { readonly scanned: number; readonly filesMatched: number; readonly total: number; readonly skippedBinary: number; readonly skippedLarge: number; readonly truncated: boolean }
interface MetaHit { readonly path: string; readonly kind: 'file' | 'dir'; readonly size: number; readonly mtimeMs: number; readonly type?: string }
interface StructuredHit { readonly path: string; readonly output: string; readonly error?: string }

const STRUCTURED_GLOBS: Readonly<Record<Structured, string[]>> = {
  'json-jsonpath': ['*.json'], 'json-jmespath': ['*.json'], 'yaml-jsonpath': ['*.yaml', '*.yml'], 'yaml-jmespath': ['*.yaml', '*.yml'], 'xml-xpath': ['*.xml', '*.csproj', '*.config', '*.svg', '*.xaml'],
};

/**
 * Tree Search (DUDE_PRD.md §21 Phase 29 items 18 and 19, Milestone 529): ripgrep-style literal/regex
 * search across a granted tree (encoding-aware, binary-skipping, with context), metadata search
 * (name, extension, size, age, magic-byte type, empty), and structured queries — JSONPath/JMESPath
 * over JSON and YAML, XPath over XML — reusing the JSON Query, YAML Path and XPath tools' evaluators.
 * Replace-across-tree is a per-hunk-selectable plan through the mutation engine's preview/confirm.
 */
@Component({
  selector: 'app-tree-search',
  imports: [ToolShell, DesktopOnlyControl, FsRootPicker, WalkOptionsPanel, ScanProgress, MutationPreview, RouterLink],
  templateUrl: './tree-search.html',
})
export class TreeSearchTool {
  protected readonly platform = inject(PlatformService);
  private readonly jobs = inject(FsJobService);
  private readonly persistence = inject(PersistenceService);

  protected readonly bytes = formatBytes;
  protected readonly root = signal('');
  protected readonly mode = this.persistence.signal<Mode>(TOOL_ID, 'mode', 'local', 'content');
  protected readonly options = this.persistence.signal<WalkOptions>(TOOL_ID, 'walkOptions', 'local', { ...DEFAULT_WALK_OPTIONS });
  protected readonly error = signal('');

  // ---- Content ----
  protected readonly pattern = signal('');
  protected readonly regex = this.persistence.signal(TOOL_ID, 'regex', 'local', false);
  protected readonly caseSensitive = this.persistence.signal(TOOL_ID, 'caseSensitive', 'local', false);
  protected readonly wholeWord = this.persistence.signal(TOOL_ID, 'wholeWord', 'local', false);
  protected readonly context = this.persistence.signal(TOOL_ID, 'context', 'local', 1);
  protected readonly fallbackEncoding = this.persistence.signal(TOOL_ID, 'fallbackEncoding', 'local', 'win1252');
  protected readonly searchJob = signal<FsJobHandle<ContentSummary> | null>(null);
  protected readonly hits = signal<readonly ContentHit[]>([]);
  protected readonly summary = signal<ContentSummary | null>(null);
  protected readonly replacement = signal('');
  protected readonly excluded = signal<ReadonlySet<string>>(new Set());
  protected readonly planJob = signal<FsJobHandle<{ preview: PlanPreview }> | null>(null);
  protected readonly preview = signal<PlanPreview | null>(null);
  protected readonly encodings = ['win1252', 'latin1', 'iso-8859-2', 'iso-8859-15', 'shift_jis', 'euc-jp', 'gbk', 'big5', 'euc-kr', 'koi8-r', 'win1251'];
  protected readonly replaceCount = computed(() => this.hits().reduce((sum, hit) => sum + hit.total, 0) - this.excluded().size);

  // ---- Metadata ----
  protected readonly names = signal('');
  protected readonly extensions = signal('');
  protected readonly types = signal('');
  protected readonly emptyOnly = signal(false);
  protected readonly metaJob = signal<FsJobHandle<{ scanned: number; found: number }> | null>(null);
  protected readonly metaHits = signal<readonly MetaHit[]>([]);

  // ---- Structured ----
  protected readonly structured = this.persistence.signal<Structured>(TOOL_ID, 'structured', 'local', 'json-jsonpath');
  protected readonly expression = signal('');
  protected readonly structuredJob = signal<FsJobHandle<{ scanned: number; sent: number; skipped: number }> | null>(null);
  protected readonly structuredHits = signal<readonly StructuredHit[]>([]);
  protected readonly structuredErrors = signal(0);
  protected readonly structuredDone = signal(false);

  protected readonly languages: readonly { id: Structured; label: string }[] = [
    { id: 'json-jsonpath', label: 'JSON · JSONPath' }, { id: 'json-jmespath', label: 'JSON · JMESPath' },
    { id: 'yaml-jsonpath', label: 'YAML · JSONPath' }, { id: 'yaml-jmespath', label: 'YAML · JMESPath' }, { id: 'xml-xpath', label: 'XML · XPath' },
  ];

  private searchParams(): Record<string, unknown> {
    return { options: this.options(), pattern: this.pattern(), regex: this.regex(), caseSensitive: this.caseSensitive(), wholeWord: this.wholeWord(), context: this.context(), fallbackEncoding: this.fallbackEncoding() };
  }

  protected search(): void {
    if (!this.root() || !this.pattern()) return;
    this.error.set('');
    this.preview.set(null);
    this.excluded.set(new Set());
    this.summary.set(null);
    const collected: ContentHit[] = [];
    this.hits.set([]);
    const job = this.jobs.run<ContentSummary, ContentHit>({ kind: 'tree-search', root: this.root(), params: this.searchParams() }, (items) => { collected.push(...items); if (collected.length <= 200) this.hits.set([...collected]); });
    this.searchJob.set(job);
    job.result.then((summary) => { this.hits.set(collected); this.summary.set(summary); }, () => {});
  }

  protected matchId(hit: ContentHit, match: LineMatch): string { return `${hit.path}#${match.line}:${match.column}`; }
  protected isIncluded(hit: ContentHit, match: LineMatch): boolean { return !this.excluded().has(this.matchId(hit, match)); }

  protected toggleMatch(hit: ContentHit, match: LineMatch, event: Event): void {
    const include = (event.target as HTMLInputElement).checked;
    const id = this.matchId(hit, match);
    this.excluded.update((current) => { const next = new Set(current); if (include) next.delete(id); else next.add(id); return next; });
  }

  protected toggleFile(hit: ContentHit, event: Event): void {
    const include = (event.target as HTMLInputElement).checked;
    this.excluded.update((current) => {
      const next = new Set(current);
      for (const match of hit.matches) { const id = this.matchId(hit, match); if (include) next.delete(id); else next.add(id); }
      return next;
    });
  }

  protected fileIncluded(hit: ContentHit): boolean { return hit.matches.some((match) => this.isIncluded(hit, match)); }

  /** Step 1 of the contract: builds a replace plan (staged, nothing written) for review. */
  protected previewReplace(): void {
    const hits = this.hits();
    if (!hits.length) return;
    this.error.set('');
    // Files whose every listed match is excluded are left out entirely (their unlisted matches too).
    const paths = hits.filter((hit) => this.fileIncluded(hit)).map((hit) => hit.path);
    const job = this.jobs.run<{ preview: PlanPreview }>({ kind: 'plan-replace', root: this.root(), params: { ...this.searchParams(), replacement: this.replacement(), skip: [...this.excluded()], paths } });
    this.planJob.set(job);
    job.result.then((result) => this.preview.set(result.preview), (caught: Error) => this.error.set(caught.message));
  }

  protected onApplied(): void { this.hits.set([]); this.summary.set(null); }

  protected segments(match: LineMatch): { before: string; hit: string; after: string } {
    return { before: match.text.slice(0, match.textColumn), hit: match.text.slice(match.textColumn, match.textColumn + match.length), after: match.text.slice(match.textColumn + match.length) };
  }

  protected exportResults(): void {
    const lines = this.hits().flatMap((hit) => hit.matches.map((match) => `${hit.path}:${match.line}:${match.column + 1}: ${match.text}`));
    downloadFile(new Blob([lines.join('\n') + '\n'], { type: 'text/plain' }), 'search-results.txt');
  }

  // ---- Metadata ----
  private list(value: string): string[] { return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean); }

  protected metaSearch(): void {
    if (!this.root()) return;
    const collected: MetaHit[] = [];
    this.metaHits.set([]);
    const job = this.jobs.run<{ scanned: number; found: number }, MetaHit>({ kind: 'metadata-search', root: this.root(), params: { options: this.options(), names: this.list(this.names()), extensions: this.list(this.extensions()), types: this.list(this.types()), emptyOnly: this.emptyOnly() } }, (items) => collected.push(...items));
    this.metaJob.set(job);
    job.result.then(() => this.metaHits.set(collected.sort((a, b) => (a.path < b.path ? -1 : 1))), () => {});
  }

  // ---- Structured ----
  protected structuredSearch(): void {
    if (!this.root() || !this.expression().trim()) return;
    const language = this.structured();
    const hits: StructuredHit[] = [];
    let errors = 0;
    this.structuredHits.set([]);
    this.structuredErrors.set(0);
    this.structuredDone.set(false);
    const options = this.options();
    const include = options.include.length ? options.include : STRUCTURED_GLOBS[language];
    const job = this.jobs.run<{ scanned: number; sent: number; skipped: number }, { path: string; text: string }>({ kind: 'read-text-files', root: this.root(), params: { options: { ...options, include } } }, (items) => {
      for (const item of items) {
        const hit = this.evaluate(language, item.path, item.text);
        if (hit?.error) errors++;
        else if (hit) hits.push(hit);
      }
      this.structuredHits.set([...hits]);
      this.structuredErrors.set(errors);
    });
    this.structuredJob.set(job);
    job.result.then(() => this.structuredDone.set(true), () => {});
  }

  private evaluate(language: Structured, path: string, text: string): StructuredHit | null {
    const expression = this.expression();
    if (language === 'xml-xpath') {
      const result = evaluateXPath(text, expression);
      if (!result.ok) return { path, output: '', error: result.error.message };
      return result.result.matches.length && !(result.result.resultType === 'boolean' && result.result.matches[0] === 'false') ? { path, output: result.result.matches.join('\n') } : null;
    }
    const [format, query] = language.split('-') as ['json' | 'yaml', 'jsonpath' | 'jmespath'];
    const result = format === 'json' ? evaluateQuery(text, expression, query) : evaluateYamlPath(text, expression, query);
    if (!result.ok) return { path, output: '', error: result.error.message };
    const output = result.output.trim();
    return output && output !== '[]' && output !== 'null' && output !== '""' ? { path, output } : null;
  }

  protected metaDate(mtimeMs: number): string { return new Date(mtimeMs).toISOString().slice(0, 10); }
  protected checked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
}
