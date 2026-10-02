import { TestBed } from '@angular/core/testing';
import { DudeBundleService } from './dude-bundle.service';
import { ProjectService } from '../project/project.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { UserScriptStoreService } from '../pipeline/user-script-store.service';
import { createPipeline, createUserScript } from "@dude/domain/core/pipeline/pipeline.model";
import { readStorageValue, writeStorageValue } from '../workspace/workspace-storage-bridge';
import { BUNDLE_FORMAT } from "@dude/domain/core/backup/dude-bundle.model";
import { HomeLayoutService } from '../home-layout/home-layout.service';
import { AppearanceService } from '../appearance/appearance.service';
import { APPEARANCE_AXES, DEFAULT_APPEARANCE } from "@dude/domain/core/appearance/appearance.model";
import { ImportPlan } from "@dude/domain/core/backup/dude-bundle.model";
import { UsageService } from '../usage/usage.service';

describe('DudeBundleService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('exports app stores and tool preferences, but never consent, secrets-namespace, or synthetic keys as preferences', () => {
    localStorage.setItem('dude:v1:json:indent', '4');
    localStorage.setItem('dude:v1:__consent__:json:input', 'true');
    localStorage.setItem('dude:v1:settings:llmApiKey', '"sk-secret"');
    localStorage.setItem('dude:v1:__usage__:opens', '[]');
    TestBed.inject(PipelineStoreService).save(createPipeline('Mine'));

    const bundle = TestBed.inject(DudeBundleService).build({ includeInputs: false });

    expect(bundle.pipelines.map((p) => p.name)).toEqual(['Mine']);
    expect(bundle.toolPreferences).toEqual({ json: { indent: '4' } });
    expect(JSON.stringify(bundle)).not.toContain('sk-secret');
    expect(bundle.toolInputs).toBeUndefined();
  });

  it('includes tool inputs only when asked, and never as a preference', () => {
    writeStorageValue('json', 'input', 'session', '{"a":1}');
    const service = TestBed.inject(DudeBundleService);

    expect(service.build({ includeInputs: false }).toolInputs).toBeUndefined();
    expect(service.build({ includeInputs: true }).toolInputs).toEqual({ json: '{"a":1}' });
  });

  it('preview writes nothing; apply writes exactly the plan', () => {
    const service = TestBed.inject(DudeBundleService);
    const pipelines = TestBed.inject(PipelineStoreService);
    const bundle = {
      format: BUNDLE_FORMAT,
      schemaVersion: 1,
      exportedAt: '',
      projects: [{ id: 'proj', name: 'P', createdAt: 'x', panelTree: null, openTabs: [], pinnedPipelineIds: [] }],
      workspaceTemplates: [],
      pipelines: [createPipeline('Imported')],
      userScripts: [createUserScript('S')],
      toolPreferences: { json: { indent: '2' } },
      toolInputs: { json: '{"from":"bundle"}' },
    };

    const preview = service.preview(JSON.stringify(bundle), 'skip');
    expect(preview.ok).toBe(true);
    expect(pipelines.pipelines()).toEqual([]);
    expect(localStorage.getItem('dude:v1:json:indent')).toBeNull();

    if (preview.ok) service.apply(preview.plan);
    expect(pipelines.pipelines().map((p) => p.name)).toEqual(['Imported']);
    expect(TestBed.inject(ProjectService).projects().map((p) => p.id)).toEqual(['proj']);
    expect(TestBed.inject(UserScriptStoreService).scripts()[0].imported).toBe(true);
    expect(localStorage.getItem('dude:v1:json:indent')).toBe('2');
    expect(readStorageValue('json', 'input', 'session')).toBe('{"from":"bundle"}');
  });

  it('refuses to write outside registered tools, even from a hand-edited bundle', () => {
    const service = TestBed.inject(DudeBundleService);
    const tampered = {
      format: BUNDLE_FORMAT,
      schemaVersion: 1,
      projects: [],
      workspaceTemplates: [],
      pipelines: [],
      userScripts: [],
      toolPreferences: {
        __workspace__: { layout: '{}' },
        __consent__: { 'json:input': 'true' },
        settings: { llmBaseUrl: '"https://evil.example"' },
        json: { '../escape': '1', input: '"smuggled as a preference"', indent: 'not json' },
      },
      toolInputs: { 'not-a-tool': 'x' },
    };
    const preview = service.preview(JSON.stringify(tampered), 'replace');
    if (preview.ok) service.apply(preview.plan);

    expect(Object.keys(localStorage)).toEqual([]);
    expect(Object.keys(sessionStorage)).toEqual([]);
  });

  it('marking an imported script reviewed clears the flag', () => {
    const scripts = TestBed.inject(UserScriptStoreService);
    scripts.importScripts([{ ...createUserScript('S'), imported: true }]);
    const id = scripts.scripts()[0].id;

    scripts.markReviewed(id);
    expect(scripts.getById(id)?.imported).toBeUndefined();
  });

  describe('Home layout', () => {
    const emptyBundle = {
      format: BUNDLE_FORMAT,
      schemaVersion: 1,
      exportedAt: '',
      projects: [],
      workspaceTemplates: [],
      pipelines: [],
      userScripts: [],
      toolPreferences: {},
    };

    it('exports the layout only once customized, and never exports usage stats alongside it', () => {
      const service = TestBed.inject(DudeBundleService);
      TestBed.inject(UsageService).recordOpen('base64');

      expect(service.build({ includeInputs: false }).homeLayout).toBeUndefined();

      const id = TestBed.inject(HomeLayoutService).appendInstance('user-text', { kind: 'text', title: 'Note', text: 'my note' });
      expect(id).not.toBeNull();
      const bundle = service.build({ includeInputs: false });

      expect(JSON.stringify(bundle.homeLayout)).toContain('my note');
      expect(JSON.stringify(bundle)).not.toContain('dailyBuckets');
      expect(JSON.stringify(bundle)).not.toContain('recentLog');
    });

    it('ignores a legacy homePanel section and plans nothing for a bundle without a layout', () => {
      const service = TestBed.inject(DudeBundleService);
      const legacy = { ...emptyBundle, homePanel: { note: 'old', links: [] } };
      const preview = service.preview(JSON.stringify(legacy), 'replace');
      expect(preview.ok && preview.plan.homeLayout).toEqual({ items: [], added: 0, replaced: 0, skipped: 0 });
      expect(preview.ok && 'homePanel' in preview.plan).toBe(false);
    });
  });

  describe('appearance (Phase 30K)', () => {
    const emptyBundle = { format: BUNDLE_FORMAT, schemaVersion: 1, exportedAt: '', projects: [], workspaceTemplates: [], pipelines: [], userScripts: [], toolPreferences: {} };
    const otherAccent = APPEARANCE_AXES['accent'].values.find((value) => value !== DEFAULT_APPEARANCE.accent) as string;

    it('omits appearance while at defaults and exports it once customized', () => {
      const service = TestBed.inject(DudeBundleService);
      expect(service.build({ includeInputs: false }).appearance).toBeUndefined();
      TestBed.inject(AppearanceService).set({ accent: otherAccent });
      expect(service.build({ includeInputs: false }).appearance?.accent).toBe(otherAccent);
    });

    it('skip keeps the current appearance; replace applies the incoming one', () => {
      const service = TestBed.inject(DudeBundleService);
      const appearance = TestBed.inject(AppearanceService);
      const incoming = JSON.stringify({ ...emptyBundle, appearance: { ...DEFAULT_APPEARANCE, accent: otherAccent } });

      // Untouched defaults: nothing to conflict with, so even skip applies.
      const first = service.preview(incoming, 'skip');
      expect(first.ok && first.plan.appearance.added).toBe(1);

      appearance.set({ density: APPEARANCE_AXES['density'].values.find((v) => v !== DEFAULT_APPEARANCE.density) as string });
      const kept = appearance.prefs();
      const skip = service.preview(incoming, 'skip');
      expect(skip.ok && skip.plan.appearance.skipped).toBe(1);
      if (skip.ok) service.apply(skip.plan);
      expect(appearance.prefs()).toEqual(kept);

      const replace = service.preview(incoming, 'replace');
      if (replace.ok) service.apply(replace.plan);
      expect(appearance.prefs()).toEqual({ ...DEFAULT_APPEARANCE, accent: otherAccent });
    });

    it('apply re-sanitizes even a hand-mutated plan', () => {
      const service = TestBed.inject(DudeBundleService);
      const preview = service.preview(JSON.stringify(emptyBundle), 'replace');
      if (!preview.ok) throw new Error('preview failed');
      const evil = { ...DEFAULT_APPEARANCE, accent: 'neon', uiFont: { custom: 'x;}body{' }, evil: 1 };
      const plan = { ...preview.plan, appearance: { items: [evil], added: 1, replaced: 0, skipped: 0 } } as unknown as ImportPlan;
      service.apply(plan);
      const prefs = TestBed.inject(AppearanceService).prefs();
      expect(prefs.accent).toBe(DEFAULT_APPEARANCE.accent);
      expect(prefs.uiFont).toEqual(DEFAULT_APPEARANCE.uiFont);
      expect(prefs).not.toHaveProperty('evil');
    });
  });
});
