import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeLayoutService } from '../../../core/home-layout/home-layout.service';
import { HomePanelService } from '../../../core/home-panel/home-panel.service';
import { migrateLegacyHomePanel } from './legacy-home-panel-migration';

describe('migrateLegacyHomePanel', () => {
  let legacy: HomePanelService;
  let layout: HomeLayoutService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    legacy = TestBed.inject(HomePanelService);
    layout = TestBed.inject(HomeLayoutService);
  });

  it('does nothing when there is no legacy content', () => {
    migrateLegacyHomePanel(legacy, layout);
    expect(layout.customized()).toBe(false);
    expect(layout.content()).toEqual({});
  });

  it('moves the note and links into the default text and link panels without customizing the layout', () => {
    legacy.setNote('remember this');
    legacy.addLink('Docs', 'https://example.com');

    migrateLegacyHomePanel(legacy, layout);

    expect(layout.customized()).toBe(false);
    expect(layout.contentOf('user-text')).toMatchObject({ kind: 'text', text: 'remember this' });
    expect(layout.contentOf('user-links')).toMatchObject({ kind: 'link' });
    expect(legacy.hasContent()).toBe(false);
  });

  it('is idempotent', () => {
    legacy.setNote('once');
    migrateLegacyHomePanel(legacy, layout);
    migrateLegacyHomePanel(legacy, layout);
    expect(Object.keys(layout.content())).toEqual(['user-text']);
  });

  it('adds panels when a customized layout has none, and keeps content that is already there', () => {
    const base = layout.layout();
    layout.save({ instances: [base.instances[0]], wide: [base.wide[0]], narrow: [base.narrow[0]], narrowCustomized: false, content: {} });
    legacy.setNote('kept');

    migrateLegacyHomePanel(legacy, layout);

    const textPanels = layout.instancesOfKind('user-text');
    expect(textPanels).toHaveLength(1);
    expect(layout.contentOf(textPanels[0].id)).toMatchObject({ text: 'kept' });
    expect(legacy.hasContent()).toBe(false);
  });

  it('uses a second panel rather than overwriting an existing note', () => {
    layout.setContent('user-text', { kind: 'text', title: 'Mine', text: 'existing' });
    legacy.setNote('legacy');

    migrateLegacyHomePanel(legacy, layout);

    expect(layout.contentOf('user-text')).toMatchObject({ text: 'existing' });
    const others = layout.instancesOfKind('user-text').filter((i) => i.id !== 'user-text');
    expect(others).toHaveLength(1);
    expect(layout.contentOf(others[0].id)).toMatchObject({ text: 'legacy' });
  });
});
