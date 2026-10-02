import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { PlatformService } from '../../core/platform/platform.service';
import { LlmProxyService } from '../../core/platform/llm-proxy.service';
import { RegexMatchResult, RegexReplaceResult } from "@dude/tool-engine/tools/regex/regex-match";
import { RegexWorkerPayload } from "@dude/tool-engine/tools/regex/regex-match-payload";
import { explainRegex, RegexExplainResult } from "@dude/tool-engine/tools/regex/regex-explain";
import { flavorNotesFor, REGEX_FLAVORS, type RegexFlavor } from "@dude/tool-engine/tools/regex/regex-flavor-notes";
import { buildExplainMessages, buildGenerateMessages, parseGeneratedPattern } from "@dude/tool-engine/tools/regex/regex-ai";

const FLAG_CHARS = ['g', 'i', 'm', 's', 'u', 'y'] as const;

export type RegexMode = 'match' | 'replace';

/** A pattern can only be stopped by terminating its worker, so auto-cancel a run that hangs this long. */
const AUTO_TIMEOUT_MS = 3000;

@Component({
  selector: 'app-regex',
  imports: [ToolShell, BusyIndicator, ErrorPanel, DesktopOnlyControl],
  templateUrl: './regex.html',
})
export class Regex implements OnDestroy {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);
  private readonly llmProxy = inject(LlmProxyService);
  protected readonly platform = inject(PlatformService);
  private timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  protected readonly flagChars = FLAG_CHARS;
  protected readonly flavors = Object.entries(REGEX_FLAVORS) as [RegexFlavor, string][];

  protected readonly pattern = this.persistence.signal('regex', 'pattern', 'session', '');
  protected readonly testText = this.persistence.signal('regex', 'testText', 'session', '');
  protected readonly flags = this.persistence.signal('regex', 'flags', 'local', 'g');
  protected readonly mode = this.persistence.signal<RegexMode>('regex', 'mode', 'local', 'match');
  protected readonly replacement = this.persistence.signal('regex', 'replacement', 'session', '');
  protected readonly flavor = this.persistence.signal<RegexFlavor>('regex', 'flavor', 'local', 'js');

  protected readonly showExplain = signal(false);

  // Stage 4 AI features — desktop-only, additive to the rule-based explainer above.
  protected readonly aiAvailable = signal(false);
  protected readonly generatePrompt = this.persistence.signal('regex', 'generatePrompt', 'session', '');
  protected readonly generateStatus = signal<'idle' | 'loading' | 'error'>('idle');
  protected readonly generateError = signal('');
  protected readonly aiExplainStatus = signal<'idle' | 'loading' | 'error'>('idle');
  protected readonly aiExplainText = signal<string | null>(null);
  protected readonly aiExplainError = signal('');

  protected readonly job = signal<WorkerJob<RegexMatchResult | RegexReplaceResult> | null>(null);

  protected readonly summary = computed(() => {
    const result = this.job()?.result();
    if (!result?.ok) return null;
    if ('matches' in result) return `${result.matches.length} match${result.matches.length === 1 ? '' : 'es'}`;
    return null;
  });

  protected readonly explainResult = computed<RegexExplainResult | null>(() => {
    if (!this.showExplain() || this.pattern() === '') return null;
    return explainRegex(this.pattern(), this.flags());
  });

  protected readonly flavorNotes = computed(() => flavorNotesFor(this.pattern(), this.flags(), this.flavor()));

  constructor() {
    if (this.platform.isDesktop()) {
      void this.llmProxy.isConfigured().then((configured) => this.aiAvailable.set(configured));
    }
  }

  protected hasFlag(flag: string): boolean {
    return this.flags().includes(flag);
  }

  protected toggleFlag(flag: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.flags();
    this.flags.set(checked ? current + flag : current.replace(flag, ''));
  }

  protected onPatternInput(event: Event): void {
    this.pattern.set((event.target as HTMLInputElement).value);
  }

  protected onTestTextInput(event: Event): void {
    this.testText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onReplacementInput(event: Event): void {
    this.replacement.set((event.target as HTMLInputElement).value);
  }

  protected setMode(mode: RegexMode): void {
    this.mode.set(mode);
  }

  protected onFlavorChange(event: Event): void {
    this.flavor.set((event.target as HTMLSelectElement).value as RegexFlavor);
  }

  protected toggleExplain(): void {
    this.showExplain.set(!this.showExplain());
  }

  protected onGeneratePromptInput(event: Event): void {
    this.generatePrompt.set((event.target as HTMLInputElement).value);
  }

  protected async generateFromPrompt(): Promise<void> {
    if (this.generatePrompt().trim() === '') return;

    this.generateStatus.set('loading');
    this.generateError.set('');

    try {
      const raw = await this.llmProxy.chat(buildGenerateMessages(this.generatePrompt()));
      const parsed = parseGeneratedPattern(raw);
      if (!parsed.ok) {
        this.generateError.set(parsed.error);
        this.generateStatus.set('error');
        return;
      }
      this.pattern.set(parsed.pattern);
      if (parsed.flags) this.flags.set(parsed.flags);
      this.generateStatus.set('idle');
    } catch (error) {
      this.generateError.set(error instanceof Error ? error.message : 'Could not generate a pattern.');
      this.generateStatus.set('error');
    }
  }

  protected async explainWithAi(): Promise<void> {
    if (this.pattern() === '') return;

    this.aiExplainStatus.set('loading');
    this.aiExplainError.set('');
    this.aiExplainText.set(null);

    try {
      this.aiExplainText.set(await this.llmProxy.chat(buildExplainMessages(this.pattern(), this.flags())));
      this.aiExplainStatus.set('idle');
    } catch (error) {
      this.aiExplainError.set(error instanceof Error ? error.message : 'Could not explain this pattern.');
      this.aiExplainStatus.set('error');
    }
  }

  protected run(): void {
    this.job()?.cancel();
    if (this.timeoutHandle !== undefined) clearTimeout(this.timeoutHandle);

    if (this.pattern() === '') {
      this.job.set(null);
      return;
    }

    const payload: RegexWorkerPayload =
      this.mode() === 'replace'
        ? { kind: 'replace', pattern: this.pattern(), flags: this.flags(), testText: this.testText(), replacement: this.replacement() }
        : { kind: 'match', pattern: this.pattern(), flags: this.flags(), testText: this.testText() };

    const job = this.workerClient.run<RegexWorkerPayload, RegexMatchResult | RegexReplaceResult>(
      () => new Worker(new URL('./regex-match.worker', import.meta.url), { type: 'module' }),
      payload,
    );
    this.job.set(job);
    this.timeoutHandle = setTimeout(() => job.cancel(), AUTO_TIMEOUT_MS);
  }

  protected cancel(): void {
    this.job()?.cancel();
  }

  protected copy(text: string): void {
    void navigator.clipboard.writeText(text);
  }

  ngOnDestroy(): void {
    this.job()?.cancel();
    if (this.timeoutHandle !== undefined) clearTimeout(this.timeoutHandle);
  }
}
