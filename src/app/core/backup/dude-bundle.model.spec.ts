import fc from 'fast-check';
import { BUNDLE_FORMAT, DudeBundle, ExistingIds, parseBundle, planImport } from './dude-bundle.model';
import { APPEARANCE_AXES, DEFAULT_APPEARANCE } from '../appearance/appearance.model';
import { Pipeline, UserScriptDefinition } from '../pipeline/pipeline.model';
import { Project } from '../project/project.model';

const script = (id: string): UserScriptDefinition => ({
  id,
  name: `Script ${id}`,
  body: 'return input;',
  accepts: ['text'],
  produces: ['text'],
  timeoutMs: 3000,
  createdAt: 'x',
  updatedAt: 'x',
});
const pipeline = (id: string, scriptId?: string): Pipeline => ({
  schemaVersion: 1,
  id,
  name: `Pipeline ${id}`,
  steps: scriptId ? [{ kind: 'script', stepId: 's1', scriptId }] : [{ kind: 'tool', stepId: 't1', toolId: 'json' }],
  createdAt: 'x',
  updatedAt: 'x',
});
const project = (id: string, pinned: string[]): Project => ({ id, name: id, createdAt: 'x', panelTree: null, openTabs: [], pinnedPipelineIds: pinned });

const BUNDLE: DudeBundle = {
  format: BUNDLE_FORMAT,
  schemaVersion: 1,
  exportedAt: '2026-09-27T00:00:00.000Z',
  projects: [project('proj', ['p1'])],
  workspaceTemplates: [],
  pipelines: [pipeline('p1', 'sc1')],
  userScripts: [script('sc1')],
  toolPreferences: { json: { indent: '4' } },
};
const NONE: ExistingIds = { projects: new Set(), workspaceTemplates: new Set(), pipelines: new Set(), userScripts: new Set() };

describe('dude-bundle model', () => {
  it('round-trips through JSON', () => {
    const parsed = parseBundle(JSON.stringify(BUNDLE));
    expect(parsed).toEqual({ ok: true, invalid: 0, bundle: { ...BUNDLE, toolInputs: undefined } });
  });

  it('rejects non-bundles and unknown versions with a clear message', () => {
    expect(parseBundle('not json')).toEqual({ ok: false, error: 'This file isn’t valid JSON.' });
    expect(parseBundle('{"format":"other"}')).toEqual({ ok: false, error: 'This file isn’t a DUDE bundle.' });
    expect(parseBundle(JSON.stringify({ ...BUNDLE, schemaVersion: 9 }))).toMatchObject({ ok: false });
  });

  it('drops and counts malformed entries instead of failing the whole import', () => {
    const tampered = { ...BUNDLE, pipelines: [pipeline('ok'), { id: 7 }, { schemaVersion: 1, id: 'x', name: 'x', steps: [{ kind: 'evil' }] }] };
    const parsed = parseBundle(JSON.stringify(tampered));
    expect(parsed.ok && parsed.invalid).toBe(2);
    expect(parsed.ok && parsed.bundle.pipelines.map((p) => p.id)).toEqual(['ok']);
  });

  it('never lets a bundle contribute a built-in template', () => {
    const tampered = { ...BUNDLE, workspaceTemplates: [{ id: 't', name: 't', builtIn: true, panelTree: null, openTabs: [] }] };
    const parsed = parseBundle(JSON.stringify(tampered));
    expect(parsed.ok && parsed.bundle.workspaceTemplates[0].builtIn).toBe(false);
  });

  it('never throws on arbitrary input', () => {
    fc.assert(fc.property(fc.string(), (text) => typeof parseBundle(text).ok === 'boolean'));
    fc.assert(fc.property(fc.jsonValue(), (value) => typeof parseBundle(JSON.stringify({ format: BUNDLE_FORMAT, schemaVersion: 1, projects: value })).ok === 'boolean'));
  });

  it('flags every imported script as needing review', () => {
    const plan = planImport(BUNDLE, NONE, 'skip');
    expect(plan.userScripts.items.every((s) => s.imported)).toBe(true);
  });

  it('skip / replace leave ids alone and count conflicts', () => {
    const existing: ExistingIds = { ...NONE, pipelines: new Set(['p1']) };
    expect(planImport(BUNDLE, existing, 'skip').pipelines).toMatchObject({ added: 0, skipped: 1, items: [] });
    expect(planImport(BUNDLE, existing, 'replace').pipelines).toMatchObject({ replaced: 1, items: [{ id: 'p1' }] });
  });

  it('keep-both renames conflicting items and rewrites references to them', () => {
    const existing: ExistingIds = { ...NONE, pipelines: new Set(['p1']), userScripts: new Set(['sc1']) };
    let n = 0;
    const plan = planImport(BUNDLE, existing, 'keep-both', () => `new-${++n}`);

    const newScriptId = plan.userScripts.items[0].id;
    const newPipeline = plan.pipelines.items[0];
    expect(newScriptId).not.toBe('sc1');
    expect(newPipeline.id).not.toBe('p1');
    expect(newPipeline.steps[0]).toMatchObject({ kind: 'script', scriptId: newScriptId });
    expect(plan.projects.items[0].pinnedPipelineIds).toEqual([newPipeline.id]);
  });

  describe('appearance (Phase 30K)', () => {
    const other = APPEARANCE_AXES['accent'].values.find((value) => value !== DEFAULT_APPEARANCE.accent) as string;
    const mine = { ...DEFAULT_APPEARANCE, accent: other };
    const withAppearance = (appearance: unknown) => JSON.stringify({ ...BUNDLE, appearance });

    it('parses an older bundle without appearance', () => {
      const parsed = parseBundle(JSON.stringify(BUNDLE));
      expect(parsed.ok && parsed.bundle.appearance).toBeUndefined();
      expect(parsed.ok && parsed.invalid).toBe(0);
    });

    it('re-sanitizes a tampered appearance', () => {
      const parsed = parseBundle(withAppearance({ accent: 'neon', uiFont: { custom: 'x;}body{' }, evil: 1 }));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.bundle.appearance?.accent).toBe(DEFAULT_APPEARANCE.accent);
      expect(parsed.bundle.appearance?.uiFont).toEqual(DEFAULT_APPEARANCE.uiFont);
      expect(parsed.bundle.appearance).not.toHaveProperty('evil');
    });

    it('treats a non-object appearance as absent and counts it invalid', () => {
      for (const bad of ['dark', 5, null, [1]]) {
        const parsed = parseBundle(withAppearance(bad));
        expect(parsed.ok && parsed.bundle.appearance).toBeUndefined();
        expect(parsed.ok && parsed.invalid).toBe(1);
      }
    });

    it('plans nothing without an incoming appearance', () => {
      expect(planImport(BUNDLE, { ...NONE, appearance: mine }, 'replace').appearance).toEqual({ items: [], added: 0, replaced: 0, skipped: 0 });
    });

    it('adds over default appearance; skip keeps a customized one; replace and keep-both replace it', () => {
      const bundle = { ...BUNDLE, appearance: mine };
      const custom = { ...DEFAULT_APPEARANCE, density: APPEARANCE_AXES['density'].values.find((v) => v !== DEFAULT_APPEARANCE.density) as string };
      expect(planImport(bundle, NONE, 'skip').appearance.added).toBe(1);
      expect(planImport(bundle, { ...NONE, appearance: DEFAULT_APPEARANCE }, 'skip').appearance.items).toEqual([mine]);
      expect(planImport(bundle, { ...NONE, appearance: custom }, 'skip').appearance).toEqual({ items: [], added: 0, replaced: 0, skipped: 1 });
      for (const mode of ['replace', 'keep-both'] as const) {
        const plan = planImport(bundle, { ...NONE, appearance: custom }, mode).appearance;
        expect(plan.items).toEqual([mine]);
        expect(plan.replaced).toBe(1);
      }
    });
  });
});
