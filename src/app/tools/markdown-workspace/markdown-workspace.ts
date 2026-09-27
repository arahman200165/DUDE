import { Component, ElementRef, OnDestroy, ViewEncapsulation, computed, effect, inject, signal, viewChild, viewChildren } from '@angular/core';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { BusyIndicator } from '../../shared/components/busy-indicator/busy-indicator';
import { SandboxedMarkdownPreview } from '../../shared/components/sandboxed-markdown-preview/sandboxed-markdown-preview';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { WorkspaceLayoutService } from '../../core/workspace/workspace-layout.service';
import { resolvePreference } from '../../core/workspace/workspace-preference';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob } from '../../core/workers/worker-job';
import { PlatformService } from '../../core/platform/platform.service';
import { CollabService } from '../../core/platform/collab.service';
import { DesktopPreferencesService } from '../../core/platform/desktop-preferences.service';
import { ShellChromeService } from '../../core/platform/shell-chrome.service';
import { downloadFile } from '../../shared/utils/download-file';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { SaveTextFile } from '../../shared/components/save-text-file/save-text-file';
import { MARKDOWN_BODY_STYLES } from '../../shared/styles/markdown-body.styles';
import { markdownPresetStyleVars, MARKDOWN_STYLE_PRESETS, type MarkdownStylePreset } from '../../shared/models/markdown-theme.model';
import { WorkspaceRenderResult, buildWorkspaceResult } from './markdown-workspace-render';
import { MarkdownWorkspacePayload } from './markdown-workspace-payload';
import { MarkdownInsertAction, applyMarkdownInsertion } from './markdown-toolbar-insert';
import { computeSyncedScrollTop } from './markdown-scroll-sync';
import { MarkdownPluginKind, MarkdownPluginManifest } from './plugins/plugin-manifest.model';
import { BUILT_IN_PLUGINS } from './plugins/builtin-plugins';
import { lintMarkdown } from './markdown-lint';
import { extractMarkdownLinks } from './markdown-link-extract';
import { LinkCheckOutcome, checkLinks } from './markdown-link-check';
import { PluginRuntimeHost } from './plugins/plugin-runtime-host';
import { CollabConnectionStatus, MarkdownCollabClient } from './collab/markdown-collab-client';
import { MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY } from './markdown-workspace-relay';

/** Inputs above this size run in a Worker instead of blocking the main thread — higher than csv-viewer/yaml-json's 50k since markdown-it rendering is cheaper per byte. */
const WORKER_THRESHOLD = 100_000;

const DEFAULT_SOURCE =
  '---\ntitle: Advanced Markdown Workspace\n---\n\n# Advanced Markdown Workspace\n\nType Markdown on the left. Try a **table**, a task list, or a heading to see the table of contents fill in.\n\n| Feature | Status |\n| --- | --- |\n| Tables | done |\n| Task lists | done |\n\n- [ ] Try me\n- [x] Already done\n';

@Component({
  selector: 'app-markdown-workspace',
  imports: [ToolShell, SplitPane, BusyIndicator, SandboxedMarkdownPreview, ErrorPanel, PluginRuntimeHost, OpenTextFile, TextFileDrop, SaveTextFile, DesktopOnlyControl],
  templateUrl: './markdown-workspace.html',
  // Emulated encapsulation adds a scoping attribute to elements the Angular
  // template compiler renders, but never to content injected via
  // [innerHTML] (that's raw HTML parsed directly into the DOM) — so scoped
  // `.markdown-body` rules would silently never match the rendered
  // Markdown at all. The same latent bug exists in the original Markdown
  // Preview tool's identical styles-block pattern (verified: its <pre>
  // background never applies either) — out of scope to fix there, but
  // this tool's whole point includes new table/task-list styling that
  // depends on these rules actually applying.
  encapsulation: ViewEncapsulation.None,
  styles: [MARKDOWN_BODY_STYLES],
})
export class MarkdownWorkspace implements OnDestroy {
  private readonly persistence = inject(PersistenceService);
  private readonly workerClient = inject(WorkerClientService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly collabApi = inject(CollabService);
  private readonly desktopPrefs = inject(DesktopPreferencesService);
  private readonly shellChrome = inject(ShellChromeService);
  protected readonly platform = inject(PlatformService);

  protected readonly source = this.persistence.signal('markdown-workspace', 'source', 'session', DEFAULT_SOURCE);
  protected readonly paneRatio = this.persistence.signal('markdown-workspace', 'paneRatio', 'local', 0.5);
  protected readonly showToc = this.persistence.signal('markdown-workspace', 'showToc', 'local', true);
  protected readonly showFrontMatterPanel = this.persistence.signal(
    'markdown-workspace',
    'showFrontMatterPanel',
    'local',
    true,
  );
  protected readonly syncScroll = this.persistence.signal('markdown-workspace', 'syncScroll', 'local', true);

  private readonly sourceTextarea = viewChild<ElementRef<HTMLTextAreaElement>>('sourceTextarea');
  private readonly previewPane = viewChild<ElementRef<HTMLDivElement>>('previewPane');

  protected readonly usesWorker = computed(() => this.source().length > WORKER_THRESHOLD);
  private readonly jobSignal = signal<WorkerJob<WorkspaceRenderResult> | null>(null);
  protected readonly job = this.jobSignal.asReadonly();

  private readonly syncResult = computed<WorkspaceRenderResult | null>(() =>
    this.usesWorker() ? null : buildWorkspaceResult(this.source()),
  );

  protected readonly result = computed<WorkspaceRenderResult | null>(() =>
    this.usesWorker() ? (this.job()?.result() ?? null) : this.syncResult(),
  );

  // Applied uniformly to both the sync and worker branches — see the
  // security note in `markdown-workspace-render.ts` about why the worker
  // can't sanitize its own output.
  protected readonly sanitizedHtml = computed(() => DOMPurify.sanitize(this.result()?.renderedHtmlRaw ?? ''));

  // Angular's own [innerHTML] sanitizer strips elements outside its safe-elements
  // allowlist — notably `<input>`, needed for GFM task-list checkboxes — even
  // from already-sanitized HTML. bypassSecurityTrustHtml() is the correct escape
  // hatch specifically for "I've already sanitized this myself" (via DOMPurify
  // above), not a way to skip sanitization.
  protected readonly safeHtml = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.sanitizedHtml()));

  protected readonly frontMatterEntries = computed(() => {
    const frontMatter = this.result()?.frontMatter;
    return frontMatter ? Object.entries(frontMatter) : [];
  });

  protected readonly stylePresets = Object.entries(MARKDOWN_STYLE_PRESETS) as [MarkdownStylePreset, (typeof MARKDOWN_STYLE_PRESETS)[MarkdownStylePreset]][];
  protected readonly stylePreset = this.persistence.signal<MarkdownStylePreset>('markdown-workspace', 'stylePreset', 'local', 'default');
  protected readonly customCss = this.persistence.signal('markdown-workspace', 'customCss', 'local', '');
  protected readonly presetStyleVars = computed(() => markdownPresetStyleVars(this.stylePreset()));
  protected readonly usesCustomCss = computed(() => this.customCss().trim() !== '');

  protected readonly plugins = this.persistence.signal<readonly MarkdownPluginManifest[]>('markdown-workspace', 'plugins', 'local', BUILT_IN_PLUGINS);
  private readonly pluginHosts = viewChildren(PluginRuntimeHost);
  protected readonly showPluginPanel = signal(false);

  protected readonly showLintPanel = signal(false);
  protected readonly lintFindings = computed(() => lintMarkdown(this.source()));

  protected readonly showLinkCheckerPanel = signal(false);
  protected readonly linkCheckStatus = signal<'idle' | 'checking'>('idle');
  protected readonly linkCheckResults = signal<readonly LinkCheckOutcome[] | null>(null);
  protected readonly documentLinks = computed(() => extractMarkdownLinks(this.source()));

  protected readonly newPluginName = signal('');
  protected readonly newPluginKind = signal<MarkdownPluginKind>('render-hook');
  protected readonly newPluginSource = signal('');
  protected readonly pluginFormError = signal('');

  protected readonly pluginRunStatus = signal<'idle' | 'running'>('idle');
  protected readonly pluginRunError = signal('');
  protected readonly toolbarActionPlugins = computed(() => this.plugins().filter((p) => p.kind === 'toolbar-action'));
  protected readonly renderHookPlugins = computed(() => this.plugins().filter((p) => p.kind === 'render-hook'));

  private isSyncingScroll = false;

  // Stage 6: local real-time collaboration, desktop-only.
  private collabClient: MarkdownCollabClient | null = null;
  protected readonly collabStatus = signal<CollabConnectionStatus | 'idle'>('idle');
  protected readonly collabRole = signal<'host' | 'joiner' | null>(null);
  protected readonly collabUrl = signal('');
  protected readonly collabSessionCode = signal('');
  protected readonly collabParticipantCount = signal(0);
  protected readonly collabError = signal('');
  protected readonly joinUrlInput = signal('');
  protected readonly joinCodeInput = signal('');
  protected readonly showCollabPanel = signal(false);

  // Stage 7: BYO relay. The global value is this tool's own `local` preference (edited from
  // Settings › Tools › Markdown Workspace); the live workspace may override it, and templates/
  // projects carry that override (manifest `settingsSection.workspaceOverridable`).
  private readonly workspaceLayout = inject(WorkspaceLayoutService);
  private readonly globalRelayUrl = this.persistence.signal(MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY, 'local', '');
  protected readonly relay = resolvePreference(MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY, this.globalRelayUrl);
  protected readonly workspaceRelayDraft = signal('');

  constructor() {
    effect((onCleanup) => {
      const source = this.source();
      if (source.length <= WORKER_THRESHOLD) {
        this.jobSignal.set(null);
        return;
      }

      const payload: MarkdownWorkspacePayload = { source };
      const job = this.workerClient.run<MarkdownWorkspacePayload, WorkspaceRenderResult>(
        () => new Worker(new URL('./markdown-workspace.worker', import.meta.url), { type: 'module' }),
        payload,
      );
      this.jobSignal.set(job);
      onCleanup(() => job.cancel());
    });
  }

  protected onSourceInput(event: Event): void {
    this.onFileLoaded((event.target as HTMLTextAreaElement).value);
  }

  /** A typed edit and an opened/dropped file are the same edit as far as collaborators are concerned. */
  protected onFileLoaded(value: string): void {
    this.source.set(value);
    this.collabClient?.applyLocalEdit(value);
  }

  protected async startHostingCollabSession(): Promise<void> {
    this.collabError.set('');
    const result = await this.collabApi.startSession();
    if (!result.ok) {
      this.collabError.set(result.error === 'not-supported' ? 'Collaboration is only available in the desktop app.' : result.error);
      return;
    }

    this.collabRole.set('host');
    this.collabUrl.set(result.url);
    this.collabSessionCode.set(result.sessionCode);
    this.connectCollabClient(result.url, result.sessionCode, this.source());
  }

  /**
   * Hosts via a self-hosted relay (Stage 7) instead of the local LAN
   * server — no IPC/Electron main process involved at all, since a relay
   * host is really just a specially-generated "join": this client
   * connects directly to `<relayUrl>/<roomId>` with a fresh random code,
   * the same way any joiner connects to any room.
   */
  protected startHostingViaRelay(): void {
    const relayUrl = this.relay().value.trim().replace(/\/+$/, '');
    if (!relayUrl) {
      this.collabError.set('Configure a relay server URL in Settings › Tools › Markdown Workspace, or set one for this workspace.');
      return;
    }

    this.collabError.set('');
    const roomId = crypto.randomUUID();
    const sessionCode = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const url = `${relayUrl}/${roomId}`;

    this.collabRole.set('host');
    this.collabUrl.set(url);
    this.collabSessionCode.set(sessionCode);
    this.connectCollabClient(url, sessionCode, this.source());
  }

  protected onWorkspaceRelayDraftInput(event: Event): void {
    this.workspaceRelayDraft.set((event.target as HTMLInputElement).value);
  }

  /** Stores the relay as an override on the live workspace (saved with templates/projects). */
  protected setWorkspaceRelay(): void {
    this.workspaceLayout.setPreferenceOverride(MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY, this.workspaceRelayDraft());
    this.workspaceRelayDraft.set('');
  }

  protected clearWorkspaceRelay(): void {
    this.workspaceLayout.setPreferenceOverride(MARKDOWN_WORKSPACE_TOOL_ID, RELAY_URL_KEY, null);
  }

  protected onJoinUrlInput(event: Event): void {
    this.joinUrlInput.set((event.target as HTMLInputElement).value);
  }

  protected onJoinCodeInput(event: Event): void {
    this.joinCodeInput.set((event.target as HTMLInputElement).value);
  }

  protected joinCollabSession(): void {
    const url = this.joinUrlInput().trim();
    const code = this.joinCodeInput().trim();
    if (!url || !code) {
      this.collabError.set('Enter both the session URL and code shared by the host.');
      return;
    }

    this.collabError.set('');
    this.collabRole.set('joiner');
    this.collabUrl.set(url);
    this.collabSessionCode.set(code);
    // A joiner never seeds content — see MarkdownCollabClientOptions.initialText's doc comment.
    this.connectCollabClient(url, code, '');
  }

  private connectCollabClient(url: string, sessionCode: string, initialText: string): void {
    this.collabClient?.destroy();
    this.collabClient = new MarkdownCollabClient({
      url,
      sessionCode,
      initialText,
      onRemoteTextChange: (text) => this.source.set(text),
      onStatusChange: (status) => this.collabStatus.set(status),
      onParticipantCountChange: (count) => {
        const previous = this.collabParticipantCount();
        this.collabParticipantCount.set(count);
        if (this.platform.isDesktop() && this.desktopPrefs.current().notifyCollaboration && previous >= 1 && count >= 1 && previous !== count) {
          void this.shellChrome.notify('DUDE collaboration', count > previous ? 'A collaborator joined.' : 'A collaborator left.');
        }
      },
    });
  }

  protected async stopCollabSession(): Promise<void> {
    this.collabClient?.destroy();
    this.collabClient = null;
    if (this.collabRole() === 'host') {
      await this.collabApi.stopSession();
    }
    this.collabRole.set(null);
    this.collabStatus.set('idle');
    this.collabUrl.set('');
    this.collabSessionCode.set('');
    this.collabParticipantCount.set(0);
  }

  protected copyCollabInfo(): void {
    void navigator.clipboard.writeText(`${this.collabUrl()} ${this.collabSessionCode()}`);
  }

  ngOnDestroy(): void {
    this.collabClient?.destroy();
    if (this.collabRole() === 'host') {
      void this.collabApi.stopSession();
    }
  }

  protected onRatioChange(ratio: number): void {
    this.paneRatio.set(ratio);
  }

  protected toggleToc(): void {
    this.showToc.set(!this.showToc());
  }

  protected toggleFrontMatterPanel(): void {
    this.showFrontMatterPanel.set(!this.showFrontMatterPanel());
  }

  protected toggleSyncScroll(): void {
    this.syncScroll.set(!this.syncScroll());
  }

  protected toggleLintPanel(): void {
    this.showLintPanel.set(!this.showLintPanel());
  }

  protected toggleLinkCheckerPanel(): void {
    this.showLinkCheckerPanel.set(!this.showLinkCheckerPanel());
  }

  /** Only ever runs from this explicit user action -- never automatically. See docs/SECURITY.md. */
  protected async runLinkCheck(): Promise<void> {
    this.linkCheckStatus.set('checking');
    const results = await checkLinks(this.documentLinks());
    this.linkCheckResults.set(results);
    this.linkCheckStatus.set('idle');
  }

  /** Moves the textarea's cursor/selection to the start of the given 1-based line and focuses it. */
  protected goToLine(line: number): void {
    const textarea = this.sourceTextarea()?.nativeElement;
    if (!textarea) return;

    const lines = this.source().split('\n');
    let offset = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i].length + 1;

    textarea.focus();
    textarea.setSelectionRange(offset, offset + (lines[line - 1]?.length ?? 0));
  }

  protected insert(action: MarkdownInsertAction): void {
    const textarea = this.sourceTextarea()?.nativeElement;
    if (!textarea) return;

    const result = applyMarkdownInsertion(this.source(), textarea.selectionStart, textarea.selectionEnd, action);
    this.source.set(result.text);

    queueMicrotask(() => {
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  protected formatFrontMatterValue(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  protected scrollToHeading(slug: string): void {
    this.previewPane()?.nativeElement.querySelector(`#${CSS.escape(slug)}`)?.scrollIntoView({ block: 'start' });
  }

  protected onSourceScroll(event: Event): void {
    if (!this.syncScroll() || this.isSyncingScroll) return;
    const source = event.target as HTMLTextAreaElement;
    const preview = this.previewPane()?.nativeElement;
    if (!preview) return;

    const targetTop = computeSyncedScrollTop(
      source.scrollTop,
      source.scrollHeight,
      source.clientHeight,
      preview.scrollHeight,
      preview.clientHeight,
    );
    this.isSyncingScroll = true;
    preview.scrollTop = targetTop;
    queueMicrotask(() => (this.isSyncingScroll = false));
  }

  protected onPreviewScroll(event: Event): void {
    if (!this.syncScroll() || this.isSyncingScroll) return;
    const preview = event.target as HTMLDivElement;
    const source = this.sourceTextarea()?.nativeElement;
    if (!source) return;

    const targetTop = computeSyncedScrollTop(
      preview.scrollTop,
      preview.scrollHeight,
      preview.clientHeight,
      source.scrollHeight,
      source.clientHeight,
    );
    this.isSyncingScroll = true;
    source.scrollTop = targetTop;
    queueMicrotask(() => (this.isSyncingScroll = false));
  }

  protected copyHtml(): void {
    void navigator.clipboard.writeText(this.sanitizedHtml());
  }

  protected downloadHtml(): void {
    downloadFile(new TextEncoder().encode(this.sanitizedHtml()), 'document.html', 'text/html');
  }

  protected clear(): void {
    this.source.set('');
  }

  protected onStylePresetChange(event: Event): void {
    this.stylePreset.set((event.target as HTMLSelectElement).value as MarkdownStylePreset);
  }

  protected onCustomCssInput(event: Event): void {
    this.customCss.set((event.target as HTMLTextAreaElement).value);
  }

  protected togglePluginPanel(): void {
    this.showPluginPanel.set(!this.showPluginPanel());
  }

  protected toggleCollabPanel(): void {
    this.showCollabPanel.set(!this.showCollabPanel());
  }

  protected onNewPluginNameInput(event: Event): void {
    this.newPluginName.set((event.target as HTMLInputElement).value);
  }

  protected onNewPluginKindChange(event: Event): void {
    this.newPluginKind.set((event.target as HTMLSelectElement).value as MarkdownPluginKind);
  }

  protected onNewPluginSourceInput(event: Event): void {
    this.newPluginSource.set((event.target as HTMLTextAreaElement).value);
  }

  protected addPlugin(): void {
    const name = this.newPluginName().trim();
    const source = this.newPluginSource().trim();
    if (!name || !source) {
      this.pluginFormError.set('Enter a name and plugin source (must define a global run(input) function).');
      return;
    }

    const manifest: MarkdownPluginManifest = { id: crypto.randomUUID(), name, kind: this.newPluginKind(), source };
    this.plugins.update((list) => [...list, manifest]);
    this.newPluginName.set('');
    this.newPluginSource.set('');
    this.pluginFormError.set('');
  }

  protected removePlugin(id: string): void {
    this.plugins.update((list) => list.filter((p) => p.id !== id));
  }

  /** Sequentially feeds the full source through each loaded render-hook plugin, chaining outputs — plugins only ever produce more Markdown, re-entering the normal render/sanitize pipeline. */
  protected async runRenderHookPlugins(): Promise<void> {
    const list = this.plugins();
    const hosts = this.pluginHosts();

    this.pluginRunStatus.set('running');
    this.pluginRunError.set('');
    let current = this.source();

    for (let i = 0; i < list.length; i++) {
      if (list[i].kind !== 'render-hook') continue;
      const host = hosts[i];
      if (!host) continue;

      try {
        current = await host.run(current);
      } catch (error) {
        this.pluginRunError.set(`Plugin "${list[i].name}" failed: ${error instanceof Error ? error.message : String(error)}`);
        this.pluginRunStatus.set('idle');
        return;
      }
    }

    this.source.set(current);
    this.pluginRunStatus.set('idle');
  }

  /** Runs one toolbar-action plugin against the current textarea selection, replacing it with the plugin's output. */
  protected async runToolbarActionPlugin(pluginId: string): Promise<void> {
    const textarea = this.sourceTextarea()?.nativeElement;
    if (!textarea) return;

    const list = this.plugins();
    const index = list.findIndex((p) => p.id === pluginId);
    const host = this.pluginHosts()[index];
    if (index === -1 || !host) return;

    const { selectionStart, selectionEnd } = textarea;
    const selected = this.source().slice(selectionStart, selectionEnd);

    this.pluginRunStatus.set('running');
    this.pluginRunError.set('');
    try {
      const replacement = await host.run(selected);
      const before = this.source().slice(0, selectionStart);
      const after = this.source().slice(selectionEnd);
      this.source.set(before + replacement + after);
    } catch (error) {
      this.pluginRunError.set(`Plugin "${list[index].name}" failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.pluginRunStatus.set('idle');
    }
  }
}
