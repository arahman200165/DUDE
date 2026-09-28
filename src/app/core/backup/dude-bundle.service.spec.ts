import { TestBed } from '@angular/core/testing';
import { DudeBundleService } from './dude-bundle.service';
import { ProjectService } from '../project/project.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { UserScriptStoreService } from '../pipeline/user-script-store.service';
import { createPipeline, createUserScript } from '../pipeline/pipeline.model';
import { readStorageValue, writeStorageValue } from '../workspace/workspace-storage-bridge';
import { BUNDLE_FORMAT } from './dude-bundle.model';
import { HomePanelService } from '../home-panel/home-panel.service';
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

  describe('Home note and links (Phase 30H.6)', () => {
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

    it('exports the panel only when it has content, and never exports usage stats alongside it', () => {
      const service = TestBed.inject(DudeBundleService);
      const panel = TestBed.inject(HomePanelService);
      TestBed.inject(UsageService).recordOpen('base64');

      expect(service.build({ includeInputs: false }).homePanel).toBeUndefined();

      panel.setNote('my note');
      panel.addLink('Docs', 'https://example.com');
      const bundle = service.build({ includeInputs: false });

      expect(bundle.homePanel?.note).toBe('my note');
      expect(bundle.homePanel?.links.map((l) => l.url)).toEqual(['https://example.com/']);
      expect(JSON.stringify(bundle)).not.toContain('dailyBuckets');
      expect(JSON.stringify(bundle)).not.toContain('recentLog');
    });

    it('round-trips through export, parse, preview and apply', () => {
      const service = TestBed.inject(DudeBundleService);
      const panel = TestBed.inject(HomePanelService);
      panel.setNote('carry me');
      panel.addLink('Docs', 'https://example.com');
      const text = JSON.stringify(service.build({ includeInputs: false }));

      localStorage.clear();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const target = TestBed.inject(DudeBundleService);
      const preview = target.preview(text, 'skip');
      expect(preview.ok && preview.plan.homePanel.added).toBe(1);
      if (preview.ok) target.apply(preview.plan);

      const restored = TestBed.inject(HomePanelService);
      expect(restored.note()).toBe('carry me');
      expect(restored.links().map((l) => l.url)).toEqual(['https://example.com/']);
    });

    it('never imports an unsafe link from a hand-edited bundle', () => {
      const service = TestBed.inject(DudeBundleService);
      const tampered = {
        ...emptyBundle,
        homePanel: {
          note: 'n',
          links: [
            { id: 'a', label: 'x', url: 'javascript:alert(document.cookie)' },
            { id: 'b', label: 'y', url: 'data:text/html,<script>1</script>' },
            { id: 'c', label: 'ok', url: 'https://ok.example.com' },
          ],
        },
      };

      const preview = service.preview(JSON.stringify(tampered), 'skip');
      if (preview.ok) service.apply(preview.plan);

      expect(TestBed.inject(HomePanelService).links().map((l) => l.url)).toEqual(['https://ok.example.com/']);
    });

    it('honors conflict modes against an existing panel', () => {
      const service = TestBed.inject(DudeBundleService);
      const panel = TestBed.inject(HomePanelService);
      panel.setNote('mine');
      panel.addLink('Mine', 'https://mine.example.com');
      const incoming = JSON.stringify({ ...emptyBundle, homePanel: { note: 'theirs', links: [{ id: 'z', label: 'Theirs', url: 'https://theirs.example.com' }] } });

      const skip = service.preview(incoming, 'skip');
      expect(skip.ok && skip.plan.homePanel).toMatchObject({ skipped: 1, items: [] });

      const keepBoth = service.preview(incoming, 'keep-both');
      if (keepBoth.ok) service.apply(keepBoth.plan);
      expect(panel.note()).toBe('mine');
      expect(panel.links().map((l) => l.url)).toEqual(['https://mine.example.com/', 'https://theirs.example.com/']);

      const replace = service.preview(incoming, 'replace');
      expect(replace.ok && replace.plan.homePanel.replaced).toBe(1);
      if (replace.ok) service.apply(replace.plan);
      expect(panel.note()).toBe('theirs');
      expect(panel.links()).toHaveLength(1);
    });

    it('plans nothing for a bundle without a panel (older bundles)', () => {
      const preview = TestBed.inject(DudeBundleService).preview(JSON.stringify(emptyBundle), 'replace');
      expect(preview.ok && preview.plan.homePanel).toEqual({ items: [], added: 0, replaced: 0, skipped: 0 });
    });
  });
});
