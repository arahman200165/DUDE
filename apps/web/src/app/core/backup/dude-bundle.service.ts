import { Injectable, inject } from '@angular/core';
import { pipelineCodec, projectCodec, userScriptCodec, workspaceTemplateCodec } from '@dude/persistence';
import type { EntityCodec } from '@dude/persistence';
import type { EntityWriteResult } from '../persistence/entities/entity-store';
import { AppearanceService } from '../appearance/appearance.service';
import { DEFAULT_APPEARANCE, sanitizeAppearance } from "@dude/domain/core/appearance/appearance.model";
import { ProjectService } from '../project/project.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { UserScriptStoreService } from '../pipeline/user-script-store.service';
import { WorkspaceTemplateService } from '../workspace/workspace-template.service';
import { HomeLayoutService } from '../home-layout/home-layout.service';
import { KindCatalog, sanitizeHomeLayoutData } from "@dude/domain/core/home-layout/home-layout-store.model";
import { PanelRegistryService } from '../registry/panel-registry.service';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { createStorageBackend } from '../persistence/storage-backend';
import { buildStorageKey, buildToolPrefix } from "@dude/tool-engine/core/persistence/persistence-keys";
import { recordImportedFileFlags, textFileInputOf } from '../text-file-input/imported-file-flags';
import { readStorageValue, writeStorageValue } from '../workspace/workspace-storage-bridge';
import { BUNDLE_FORMAT, BUNDLE_SCHEMA_VERSION, ConflictMode, DudeBundle, ImportPlan, parseBundle, planImport } from "@dude/domain/core/backup/dude-bundle.model";

const STORAGE_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;

/** Outcome of `apply`: entity imports settle once the store committed them (one transaction per type on desktop). */
export interface ApplyResult {
  readonly ok: boolean;
  /** Items the codecs rejected (counted, never written). */
  readonly invalid: number;
  readonly errors: readonly string[];
}

function decodeAll<T>(codec: EntityCodec<T>, items: readonly unknown[]): { valid: T[]; invalid: number } {
  const valid: T[] = [];
  for (const item of items) {
    const value = codec.decode(item, undefined as never);
    if (value !== null && value !== undefined) valid.push(value);
  }
  return { valid, invalid: items.length - valid.length };
}

export type ImportPreview = { readonly ok: true; readonly plan: ImportPlan } | { readonly ok: false; readonly error: string };

/**
 * Export/import of a `DudeBundle` (DUDE_PRD.md §21 Phase 26 Item 14). Identical on web and desktop,
 * so a web user can move their projects and pipelines into Desktop DUDE by hand.
 *
 * Import is two-step like every other destructive action: `preview()` is pure, and `apply(plan)`
 * writes only what that plan listed. `apply` re-checks the boundary itself rather than trusting the
 * file:
 * - tool preferences only for registered tools, never a synthetic `__…__` namespace;
 * - tool inputs only through each tool's own declared input policy.
 */
@Injectable({ providedIn: 'root' })
export class DudeBundleService {
  private readonly projects = inject(ProjectService);
  private readonly pipelines = inject(PipelineStoreService);
  private readonly scripts = inject(UserScriptStoreService);
  private readonly templates = inject(WorkspaceTemplateService);
  private readonly homeLayout = inject(HomeLayoutService);
  private readonly appearance = inject(AppearanceService);
  private readonly panels = inject(PanelRegistryService);
  private readonly registry = inject(ToolRegistryService);
  private readonly local = createStorageBackend('local');

  build(options: { readonly includeInputs: boolean }): DudeBundle {
    const toolPreferences: Record<string, Record<string, string>> = {};
    for (const tool of this.registry.getAll()) {
      const inputKey = textFileInputOf(tool)?.key;
      const prefix = buildToolPrefix(tool.id);
      for (const storageKey of this.local.keys(prefix)) {
        const key = storageKey.slice(prefix.length);
        if (key === inputKey || !STORAGE_KEY_PATTERN.test(key)) continue;
        const raw = this.local.get(storageKey);
        if (raw !== null) (toolPreferences[tool.id] ??= {})[key] = raw;
      }
    }

    const toolInputs: Record<string, string> = {};
    if (options.includeInputs) {
      for (const tool of this.registry.getAll()) {
        const input = textFileInputOf(tool);
        const value = input && readStorageValue<unknown>(tool.id, input.key, input.policy ?? 'session');
        if (typeof value === 'string' && value.length > 0) toolInputs[tool.id] = value;
      }
    }

    return {
      format: BUNDLE_FORMAT,
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      projects: this.projects.projects(),
      workspaceTemplates: this.templates.templates().filter((template) => !template.builtIn),
      pipelines: this.pipelines.pipelines(),
      userScripts: this.scripts.scripts(),
      toolPreferences,
      ...(options.includeInputs ? { toolInputs } : {}),
      ...(this.homeLayout.customized() || Object.keys(this.homeLayout.content()).length > 0 ? { homeLayout: this.homeLayout.data() } : {}),
      // Like homeLayout, omitted while untouched (equal to the defaults).
      ...(JSON.stringify(this.appearance.prefs()) !== JSON.stringify(DEFAULT_APPEARANCE) ? { appearance: this.appearance.prefs() } : {}),
    };
  }

  preview(text: string, mode: ConflictMode): ImportPreview {
    const catalog: KindCatalog = { resolve: (id) => this.panels.resolveKind(id) };
    const parsed = parseBundle(text, (raw) => sanitizeHomeLayoutData(raw, catalog, this.panels.defaultLayout()));
    if (!parsed.ok) return parsed;
    const plan = planImport(parsed.bundle, this.existingIds(), mode);
    return { ok: true, plan: { ...plan, invalid: parsed.invalid } };
  }

  apply(plan: ImportPlan): Promise<ApplyResult> {
    // Each entity type goes through its codec and one `importMany` (a single transaction on desktop).
    const scripts = decodeAll(userScriptCodec, plan.userScripts.items);
    const pipelines = decodeAll(pipelineCodec, plan.pipelines.items);
    const projects = decodeAll(projectCodec, plan.projects.items);
    const templates = decodeAll(workspaceTemplateCodec, plan.workspaceTemplates.items);
    const invalid = scripts.invalid + pipelines.invalid + projects.invalid + templates.invalid;
    if (invalid > 0) console.warn(`[bundle-import] skipped ${invalid} invalid item(s)`);
    const writes: Promise<EntityWriteResult>[] = [
      this.scripts.importScripts(scripts.valid),
      this.pipelines.importPipelines(pipelines.valid),
      this.projects.importProjects(projects.valid),
      this.templates.importUserTemplates(templates.valid),
    ];
    // `importData` re-sanitizes against the panel registry and merges per the previewed conflict mode.
    for (const layout of plan.homeLayout.items) this.homeLayout.importData(layout, plan.conflictMode ?? 'skip');
    // Re-sanitized again so a hand-built plan can't smuggle values past the model. `set` persists
    // through AppearanceService's own store, so it applies live without a reload.
    for (const prefs of plan.appearance.items.slice(0, 1)) this.appearance.set(sanitizeAppearance(prefs));

    for (const [toolId, keys] of Object.entries(plan.toolPreferences)) {
      const tool = this.registry.getById(toolId);
      if (!tool) continue;
      const inputKey = textFileInputOf(tool)?.key;
      for (const [key, raw] of Object.entries(keys)) {
        if (key === inputKey || !STORAGE_KEY_PATTERN.test(key) || !isJson(raw)) continue;
        this.local.set(buildStorageKey(toolId, key), raw);
      }
    }

    for (const [toolId, text] of Object.entries(plan.toolInputs)) {
      const tool = this.registry.getById(toolId);
      const input = tool && textFileInputOf(tool);
      if (!input) continue;
      writeStorageValue(toolId, input.key, input.policy ?? 'session', text);
      // Imported text is gated like an opened file (e.g. HTML Preview asks before rendering it).
      recordImportedFileFlags(`imported${input.extensions[0] ?? ''}`);
    }

    return Promise.all(writes).then((results) => {
      const errors = results.flatMap((result) => (result.ok ? [] : [result.error]));
      return { ok: errors.length === 0, invalid, errors };
    });
  }

  private existingIds() {
    return {
      projects: new Set(this.projects.projects().map((project) => project.id)),
      workspaceTemplates: new Set(this.templates.templates().map((template) => template.id)),
      pipelines: new Set(this.pipelines.pipelines().map((pipeline) => pipeline.id)),
      userScripts: new Set(this.scripts.scripts().map((script) => script.id)),
      homeLayout: this.homeLayout.data(),
      appearance: this.appearance.prefs(),
    };
  }
}

function isJson(raw: string): boolean {
  try {
    JSON.parse(raw);
    return true;
  } catch {
    return false;
  }
}

