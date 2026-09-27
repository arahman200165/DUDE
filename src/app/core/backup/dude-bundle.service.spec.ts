import { TestBed } from '@angular/core/testing';
import { DudeBundleService } from './dude-bundle.service';
import { ProjectService } from '../project/project.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { UserScriptStoreService } from '../pipeline/user-script-store.service';
import { createPipeline, createUserScript } from '../pipeline/pipeline.model';
import { readStorageValue, writeStorageValue } from '../workspace/workspace-storage-bridge';
import { BUNDLE_FORMAT } from './dude-bundle.model';

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
});
