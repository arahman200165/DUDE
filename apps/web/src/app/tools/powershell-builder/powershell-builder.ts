import { PowerShellBuilderTool_parameterDefinition, PowerShellBuilderTool_messageFor } from "@dude/tool-engine/tools/powershell-builder/powershell-builder.embedded-engine";
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  analyzePowerShellScript, buildPowerShellScript, type PowerShellCmdletDefinition, type PowerShellOutputFormat, type PowerShellParameterDefinition,
} from "@dude/contracts/shared/system/powershell-builder";
import type { PowerShellHistoryEntry, PowerShellRunEvent, PowerShellRunPreview } from "@dude/contracts/system/powershell-types";
import { PersistenceService } from '../../core/persistence/persistence.service';
import { PlatformService } from '../../core/platform/platform.service';
import { PowerShellWorkbenchService } from '../../core/platform/powershell-workbench.service';
import { PwshStatusService } from '../../core/platform/pwsh-status.service';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { PwshRequired } from '../../shared/components/pwsh-required/pwsh-required';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { draftValue, savedScriptFor, type ParameterDraft, type StageDraft } from "@dude/tool-engine/tools/powershell-builder/powershell-builder-logic";

type Mode = 'builder' | 'script';
type FormatKind = 'none' | 'table' | 'list' | 'select' | 'json' | 'csv';
const MAX_OUTPUT_CHARS = 400_000;
const MAX_SAVED = 50;

/**
 * PowerShell Builder (M612). Building, editing, loading the catalog and restoring history only ever produce text in
 * the editor. Nothing runs until "Preview run" shows the exact script, its SHA-256, the working directory and the
 * elevation state, and a second, separate "Run this script" click obtains a single-use token and starts pwsh.
 * History restores load the script into the editor and never rerun it (DUDE_PRD.md §5.2.1).
 */
@Component({
  selector: 'app-powershell-builder',
  imports: [ToolShell, DesktopOnlyControl, PwshRequired, StatusGlyph],
  templateUrl: './powershell-builder.html',
})
export class PowerShellBuilderTool {
  protected readonly platform = inject(PlatformService);
  private readonly pwsh = inject(PwshStatusService);
  private readonly workbench = inject(PowerShellWorkbenchService);
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = signal<Mode>('builder');
  protected readonly catalog = signal<readonly PowerShellCmdletDefinition[]>([]);
  protected readonly catalogVersion = signal('');
  protected readonly catalogLoading = signal(false);
  protected readonly catalogError = signal('');
  protected readonly stages = signal<readonly StageDraft[]>([{ cmdlet: '', parameters: [] }]);
  protected readonly formatKind = signal<FormatKind>('none');
  protected readonly formatText = signal('');
  protected readonly script = signal('');
  protected readonly cwd = signal('');
  protected readonly timeoutSeconds = signal(60);
  protected readonly preview = signal<PowerShellRunPreview | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly runId = signal<string | null>(null);
  protected readonly stdout = signal('');
  protected readonly stderr = signal('');
  protected readonly result = signal<PowerShellRunEvent | null>(null);
  protected readonly history = signal<readonly PowerShellHistoryEntry[]>([]);
  /** Script text kept locally by digest so a history row can be loaded into the editor (never run). */
  protected readonly saved = this.persistence.signal<Record<string, { script: string; at: string }>>('powershell-builder', 'saved', 'local', {});

  /** Events that arrive before `run` resolves (a very fast script) are replayed once the run id is known. */
  private early: PowerShellRunEvent[] = [];

  private readonly byName = computed(() => new Map(this.catalog().map((command) => [command.name.toLowerCase(), command])));
  protected readonly cmdletNames = computed(() => this.catalog().map((command) => command.name));

  protected readonly built = computed(() => {
    if (this.mode() !== 'builder') return null;
    try {
      const stages = this.stages().filter((stage) => stage.cmdlet.trim() !== '').map((stage) => {
        const definition = this.byName().get(stage.cmdlet.trim().toLowerCase());
        if (!definition) throw new Error(`${stage.cmdlet} is not in the cmdlet catalog.`);
        const parameters: Record<string, ReturnType<typeof draftValue>> = {};
        for (const draft of stage.parameters) {
          const type = this.parameterDefinition(definition, draft.name)?.type ?? 'string';
          parameters[draft.name] = draftValue(type, draft.raw);
        }
        return { cmdlet: definition.name, parameters };
      });
      return { ok: true as const, ...buildPowerShellScript(stages, this.outputFormat(), this.catalog()) };
    } catch (caught) { return { ok: false as const, message: this.messageFor(caught) }; }
  });

  protected readonly warnings = computed(() => analyzePowerShellScript(this.script()));
  protected readonly canPreview = computed(() => this.script().trim().length > 0 && !this.busy() && !this.runId());
  protected readonly running = computed(() => this.runId() !== null && this.result() === null);

  constructor() {
    const destroy = inject(DestroyRef);
    effect(() => {
      const built = this.built();
      if (built) this.script.set(built.ok ? built.script : '');
    });
    // Editing after a preview invalidates it: the token would not match the new digest anyway.
    effect(() => {
      const text = this.script();
      const current = untracked(() => this.preview());
      if (current && current.script !== text) void this.dropPreview();
    });
    if (this.platform.isDesktop() && this.workbench.available) {
      destroy.onDestroy(this.workbench.listen((event) => this.onEvent(event)));
      void this.start();
    }
  }

  private async start(): Promise<void> {
    const status = await this.pwsh.ensureLoaded();
    if (!status.available) return;
    void this.loadHistory();
    await this.loadCatalog(false);
  }

  protected async loadCatalog(refresh: boolean): Promise<void> {
    this.catalogLoading.set(true);
    this.catalogError.set('');
    try {
      const { version, commands } = await this.workbench.catalog(refresh);
      this.catalog.set(commands);
      this.catalogVersion.set(version);
    } catch (caught) { this.catalogError.set(this.messageFor(caught)); }
    finally { this.catalogLoading.set(false); }
  }

  private async loadHistory(): Promise<void> {
    try { this.history.set(await this.workbench.history()); } catch { /* history is optional */ }
  }

  private outputFormat(): PowerShellOutputFormat {
    const kind = this.formatKind();
    const text = this.formatText().trim();
    const list = text.split(/[\s,]+/).filter(Boolean);
    switch (kind) {
      case 'table': case 'list': case 'select': return { kind, properties: list };
      case 'json': return { kind, depth: text ? Number(text) : 2 };
      case 'csv': return { kind, delimiter: text || ',' };
      default: return { kind: 'none' };
    }
  }
  private parameterDefinition = PowerShellBuilderTool_parameterDefinition;


  protected definitionFor(cmdlet: string, name: string): PowerShellParameterDefinition | undefined {
    const command = this.byName().get(cmdlet.trim().toLowerCase());
    return command ? this.parameterDefinition(command, name) : undefined;
  }

  protected parameterChoices(stage: StageDraft): readonly PowerShellParameterDefinition[] {
    const command = this.byName().get(stage.cmdlet.trim().toLowerCase());
    if (!command) return [];
    const seen = new Map<string, PowerShellParameterDefinition>();
    for (const set of command.parameterSets) for (const parameter of set.parameters) if (!seen.has(parameter.name)) seen.set(parameter.name, parameter);
    const used = new Set(stage.parameters.map((parameter) => parameter.name));
    return [...seen.values()].filter((parameter) => !used.has(parameter.name));
  }

  protected setMode(mode: Mode): void { this.mode.set(mode); }
  protected addStage(): void { this.stages.update((stages) => [...stages, { cmdlet: '', parameters: [] }]); }
  protected removeStage(index: number): void { this.stages.update((stages) => (stages.length > 1 ? stages.filter((_, i) => i !== index) : [{ cmdlet: '', parameters: [] }])); }
  protected setCmdlet(index: number, cmdlet: string): void { this.stages.update((stages) => stages.map((stage, i) => (i === index ? { cmdlet, parameters: [] } : stage))); }
  protected addParameter(index: number, name: string): void {
    if (!name) return;
    this.stages.update((stages) => stages.map((stage, i) => {
      if (i !== index) return stage;
      const definition = this.definitionFor(stage.cmdlet, name);
      const boolean = definition?.type === 'boolean' || definition?.type === 'switch';
      const draft: ParameterDraft = { name, raw: boolean ? 'true' : (definition?.validateSet?.[0] ?? '') };
      return { ...stage, parameters: [...stage.parameters, draft] };
    }));
  }
  protected setParameter(index: number, name: string, raw: string): void {
    this.stages.update((stages) => stages.map((stage, i) => (i === index ? { ...stage, parameters: stage.parameters.map((p) => (p.name === name ? { name, raw } : p)) } : stage)));
  }
  protected removeParameter(index: number, name: string): void {
    this.stages.update((stages) => stages.map((stage, i) => (i === index ? { ...stage, parameters: stage.parameters.filter((p) => p.name !== name) } : stage)));
  }

  protected editAsScript(): void { this.mode.set('script'); }
  protected onScriptInput(value: string): void { this.script.set(value); }
  protected valueOf(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value; }

  private async dropPreview(): Promise<void> {
    const current = this.preview();
    this.preview.set(null);
    if (current) { try { await this.workbench.discard(current.previewId); } catch { /* already expired */ } }
  }

  /** Step 1: shows exactly what would run. Runs nothing. */
  protected async previewRun(): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try { this.preview.set(await this.workbench.preview(this.script(), this.cwd().trim())); }
    catch (caught) { this.error.set(this.messageFor(caught)); }
    finally { this.busy.set(false); }
  }

  protected async discardPreview(): Promise<void> { await this.dropPreview(); }

  /** Step 2: separate, explicit click. Obtains a single-use token for exactly this preview, then starts pwsh. */
  protected async confirmRun(): Promise<void> {
    const current = this.preview();
    if (!current) return;
    this.error.set('');
    this.busy.set(true);
    this.stdout.set(''); this.stderr.set(''); this.result.set(null);
    this.early = [];
    try {
      const { runId } = await this.workbench.confirmAndRun(current.previewId, this.timeoutSeconds() * 1000);
      this.runId.set(runId);
      const early = this.early;
      this.early = [];
      for (const event of early) this.onEvent(event);
      this.rememberScript(current);
      this.preview.set(null);
    } catch (caught) { this.error.set(this.messageFor(caught)); this.preview.set(null); }
    finally { this.busy.set(false); }
  }

  private rememberScript(preview: PowerShellRunPreview): void {
    this.saved.update((saved) => {
      const next = { ...saved, [preview.sha256]: { script: preview.script, at: new Date().toISOString() } };
      const keys = Object.keys(next).sort((a, b) => next[b].at.localeCompare(next[a].at));
      return Object.fromEntries(keys.slice(0, MAX_SAVED).map((key) => [key, next[key]]));
    });
  }

  private onEvent(event: PowerShellRunEvent): void {
    if (this.runId() === null) { if (this.busy()) this.early.push(event); return; }
    if (event.runId !== this.runId()) return;
    if (event.stream === 'stdout') this.stdout.update((text) => (text + (event.text ?? '')).slice(-MAX_OUTPUT_CHARS));
    else if (event.stream === 'stderr') this.stderr.update((text) => (text + (event.text ?? '')).slice(-MAX_OUTPUT_CHARS));
    else { this.result.set(event); this.runId.set(null); void this.loadHistory(); }
  }

  protected async cancelRun(): Promise<void> {
    const id = this.runId();
    if (id) await this.workbench.cancel(id);
  }

  /** Restoring never runs anything: it only fills the editor. */
  protected loadEntry(entry: PowerShellHistoryEntry): void {
    const script = savedScriptFor(this.saved(), entry.sha256);
    if (script === undefined) return;
    this.mode.set('script');
    this.script.set(script);
  }

  protected hasScript(entry: PowerShellHistoryEntry): boolean { return savedScriptFor(this.saved(), entry.sha256) !== undefined; }

  protected async clearHistory(): Promise<void> {
    try { await this.workbench.clearHistory(); } catch { /* ignore */ }
    this.saved.set({});
    this.history.set([]);
  }
  private messageFor = PowerShellBuilderTool_messageFor;

}
