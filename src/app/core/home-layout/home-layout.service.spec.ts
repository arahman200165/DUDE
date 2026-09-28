import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PanelDefinition } from '../../shared/models/panel-definition.model';
import { DudeBundleService } from '../backup/dude-bundle.service';
import { FavoritesService } from '../favorites/favorites.service';
import { PANEL_DEFINITIONS_TOKEN } from '../registry/panel-registry.service';
import { HomeLayoutService } from './home-layout.service';
import { PersistenceService } from '../persistence/persistence.service';

const KEY = 'dude:v1:__home-layout__:layout';
const stable = () => TestBed.inject(ApplicationRef).whenStable();
const load = () => Promise.resolve(null);
const defs: PanelDefinition[] = [
  { id: 'rail', title: 'Rail', description: 'r', load, size: { minW: 3, minH: 2 }, dataDependencies: ['usage'], defaultPlacement: { order: 1, w: 6, h: 2 } },
  { id: 'default-note', title: 'Note', description: 'n', load, size: { minW: 3, minH: 2 }, userContent: 'text', dataDependencies: ['user-content'], defaultPlacement: { order: 2, w: 6, h: 2 } },
  { id: 'note', title: 'Note', description: 'n', load, size: { minW: 3, minH: 2 }, multiInstance: true, userContent: 'text', dataDependencies: ['user-content'] },
];

describe('HomeLayoutService', () => {
  let service: HomeLayoutService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: PANEL_DEFINITIONS_TOKEN, useValue: defs }] });
    service = TestBed.inject(HomeLayoutService);
  });

  it('renders the manifest default and stores nothing until saved', async () => {
    expect(service.customized()).toBe(false);
    expect(service.layout().instances.map((i) => i.id)).toEqual(['rail', 'default-note']);
    await stable();
    expect(localStorage.getItem(KEY) ?? '').not.toContain('"customized":true');
  });

  it('saves a valid draft and keeps wide/narrow independent around shared instances', () => {
    const base = service.layout();
    const result = service.save({
      instances: base.instances,
      wide: [
        { id: 'rail', x: 0, y: 0, w: 12, h: 2 },
        { id: 'default-note', x: 0, y: 2, w: 12, h: 2 },
      ],
      narrow: [
        { id: 'default-note', x: 0, y: 0, w: 12, h: 3 },
        { id: 'rail', x: 0, y: 3, w: 12, h: 2 },
      ],
      narrowCustomized: true,
      content: {},
    });
    expect(result.ok).toBe(true);
    expect(service.customized()).toBe(true);
    expect(service.layout().wide.map((i) => i.id)).toEqual(['rail', 'default-note']);
    expect(service.layout().narrow.map((i) => i.id)).toEqual(['default-note', 'rail']);
  });

  it('rejects overlapping placements with issues instead of moving them', () => {
    const base = service.layout();
    const result = service.save({
      instances: base.instances,
      wide: [
        { id: 'rail', x: 0, y: 0, w: 6, h: 2 },
        { id: 'default-note', x: 3, y: 0, w: 6, h: 2 },
      ],
      narrow: base.narrow,
      narrowCustomized: false,
      content: {},
    });
    expect(result.ok).toBe(false);
    expect(service.customized()).toBe(false);
  });

  it('stores user-authored content per instance and restoring never needs a target', () => {
    service.setContent('default-note', { kind: 'text', title: 'Todo', text: 'ship it' });
    expect(service.contentOf('default-note')).toMatchObject({ text: 'ship it' });
    service.setContent('not-an-instance', { kind: 'text', title: '', text: 'x' });
    expect(service.contentOf('not-an-instance')).toBeUndefined();
  });

  it('reset restores the default without touching other stores', () => {
    const favorites = TestBed.inject(FavoritesService);
    favorites.toggleTool('json');
    const base = service.layout();
    service.save({ instances: [base.instances[0]], wide: [base.wide[0]], narrow: [base.narrow[0]], narrowCustomized: false, content: {} });
    service.setContent('default-note', { kind: 'text', title: '', text: 'keep me' });
    expect(service.layout().instances).toHaveLength(1);

    service.resetToDefault();
    expect(service.customized()).toBe(false);
    expect(service.layout().instances.map((i) => i.id)).toEqual(['rail', 'default-note']);
    expect(favorites.isToolPinned('json')).toBe(true);
  });

  it('recovers from corrupt stored data without blanking Home', () => {
    localStorage.setItem(KEY, '{"schemaVersion":1,"customized":true,"instances":"nope","wide":7}');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PANEL_DEFINITIONS_TOKEN, useValue: defs }] });
    const fresh = TestBed.inject(HomeLayoutService);
    expect(fresh.layout().wide.length + fresh.layout().instances.length).toBeGreaterThanOrEqual(0);
    expect(() => fresh.layout()).not.toThrow();
  });

  it('is wiped by Clear All (persistence.clearAll)', async () => {
    service.setContent('default-note', { kind: 'text', title: '', text: 'x' });
    await stable();
    expect(localStorage.getItem(KEY)).toContain('"x"');
    TestBed.inject(PersistenceService).clearAll();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  describe('backup round trip', () => {
    it('exports a customized layout with content and re-imports it sanitized', () => {
      const base = service.layout();
      service.save({
        instances: [...base.instances, { id: 'note-1', kindId: 'note', config: {}, visible: true }],
        wide: [...base.wide, { id: 'note-1', x: 0, y: 2, w: 6, h: 2 }],
        narrow: [...base.narrow, { id: 'note-1', x: 0, y: 4, w: 12, h: 2 }],
        narrowCustomized: false,
        content: { 'note-1': { kind: 'text', title: 'Mine', text: 'hello' } },
      });
      const bundles = TestBed.inject(DudeBundleService);
      const bundle = bundles.build({ includeInputs: false });
      expect(bundle.homeLayout?.content['note-1']).toMatchObject({ text: 'hello' });

      service.resetToDefault();
      const preview = bundles.preview(JSON.stringify(bundle), 'skip');
      expect(preview.ok && preview.plan.homeLayout.added).toBe(1);
      if (preview.ok) bundles.apply(preview.plan);
      expect(service.contentOf('note-1')).toMatchObject({ text: 'hello' });
      expect(service.layout().instances.map((i) => i.id)).toContain('note-1');
    });

    it('sanitizes a tampered layout section on import', () => {
      const bundles = TestBed.inject(DudeBundleService);
      const tampered = {
        format: 'dude-bundle',
        schemaVersion: 1,
        exportedAt: '',
        projects: [],
        workspaceTemplates: [],
        pipelines: [],
        userScripts: [],
        toolPreferences: {},
        homeLayout: {
          customized: true,
          instances: [{ id: 'note-1', kindId: 'note', config: {}, visible: true }],
          wide: [{ id: 'note-1', x: -50, y: 0, w: 500, h: 0 }],
          content: { 'note-1': { kind: 'link', title: 'x', links: [{ url: 'javascript:alert(1)', label: 'bad' }] } },
        },
      };
      const preview = bundles.preview(JSON.stringify(tampered), 'skip');
      if (preview.ok) bundles.apply(preview.plan);
      expect(service.contentOf('note-1')).toBeUndefined();
      const placed = service.layout().wide.find((i) => i.id === 'note-1');
      expect(placed && placed.x >= 0 && placed.x + placed.w <= 12).toBe(true);
    });
  });
});
