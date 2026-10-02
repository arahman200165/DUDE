import { Component, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeLayoutService } from '../../../core/home-layout/home-layout.service';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { PlatformService } from '../../../core/platform/platform.service';
import { PANEL_DEFINITIONS } from '../../../core/registry/panel-definitions';
import { PANEL_DEFINITIONS_TOKEN } from '../../../core/registry/panel-registry.service';
import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";
import { SettingsUnsavedChanges } from '../settings-unsaved-changes';
import { HomeLayoutSettings } from './home-layout-settings';

function setup(desktop = false, extra: Provider[] = []) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: PlatformService, useValue: { isDesktop: () => desktop } }, ...extra] });
  const fixture = TestBed.createComponent(HomeLayoutSettings);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (label: string, root: ParentNode = el) => {
    const button = Array.from(root.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label);
    if (!button) throw new Error(`No button "${label}"`);
    button.click();
    fixture.detectChanges();
  };
  const status = () => el.querySelector('[data-testid="layout-status"]')?.textContent?.trim() ?? '';
  const rowIds = () => Array.from(el.querySelectorAll('[data-panel-row]')).map((r) => r.getAttribute('data-panel-row'));
  return { fixture, el, click, status, rowIds, layout: TestBed.inject(HomeLayoutService), unsaved: TestBed.inject(SettingsUnsavedChanges) };
}

@Component({ selector: 'app-fixture-panel', template: '' })
class FixturePanel {}

/** Test-only kind, declared like a manifest but absent from the generated registry. */
const FIXTURE_KIND: PanelDefinition = {
  id: 'fixture-kind',
  title: 'Fixture kind',
  description: 'Test-only panel kind.',
  load: async () => FixturePanel,
  size: { minW: 3, minH: 2 },
  dataDependencies: [],
};

describe('HomeLayoutSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('lists the default panels in reading order with a preview, and is not dirty', () => {
    const { rowIds, el, unsaved } = setup();
    expect(rowIds().slice(0, 3)).toEqual(['home-search', 'smart-entry', 'home-pwa-hint']);
    expect(el.querySelector('[data-testid="layout-preview"]')).not.toBeNull();
    expect(unsaved.hasUnsavedChanges()).toBe(false);
  });

  it('marks the editor dirty on change, and Save persists and clears it', () => {
    const { click, status, layout, unsaved, fixture } = setup();
    click('Move later', undefined);
    // First "Move later" button is on the first row (home-search) — swapping with smart-entry.
    fixture.detectChanges();
    expect(unsaved.hasUnsavedChanges()).toBe(true);
    expect(status()).toContain('Moved');

    click('Save layout');
    expect(status()).toBe('Home layout saved.');
    expect(layout.customized()).toBe(true);
    expect(unsaved.hasUnsavedChanges()).toBe(false);
  });

  it('refuses an overlapping resize with a readable reason and changes nothing', () => {
    const { el, fixture, status, layout } = setup();
    const row = el.querySelector('[data-panel-row="resume-work"]') as HTMLElement;
    const width = Array.from(row.querySelectorAll('input[type="number"]'))[2] as HTMLInputElement; // Width (cells)
    width.value = '12';
    width.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(status()).toMatch(/Overlaps 1 other panel/);
    expect(width.value).toBe('6');
    expect(layout.customized()).toBe(false);
  });

  it('hides a panel, and Home no longer lists it once saved', () => {
    const { el, fixture, click, layout } = setup();
    const row = el.querySelector('[data-panel-row="smart-entry"]') as HTMLElement;
    const box = row.querySelector('input[type="checkbox"]') as HTMLInputElement;
    box.click();
    fixture.detectChanges();
    click('Save layout');
    expect(layout.layout().instances.find((i) => i.id === 'smart-entry')!.visible).toBe(false);
  });

  it('adds a single-instance kind once and duplicates a multi-instance one', () => {
    const { click, rowIds, layout, fixture } = setup();
    // Remove Favorites (multi), then Add it back; a second Add of a single-instance kind is disabled.
    click('Remove Favorites');
    expect(rowIds()).not.toContain('favorites');
    click('Add Favorites');
    expect(rowIds().filter((id) => id!.startsWith('favorites'))).toHaveLength(1);

    click('Duplicate Favorites');
    expect(rowIds().filter((id) => id!.startsWith('favorites'))).toHaveLength(2);

    const addSmartEntry = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === 'Add Smart Entry') as HTMLButtonElement;
    expect(addSmartEntry.disabled).toBe(true);
    expect(layout.customized()).toBe(false); // nothing saved yet
  });

  it('edits narrow independently and offers to follow wide again', () => {
    const { el, fixture, click, status } = setup();
    click('Narrow layout');
    expect(el.querySelector('[data-testid="narrow-note"]')?.textContent).toContain('follows the wide layout');
    click('Move Search & Jump later');
    fixture.detectChanges();
    expect(status()).toContain('Moved');
    expect(el.querySelector('[data-testid="narrow-note"]')?.textContent).toContain('independently');
    click('Follow the wide layout again');
    expect(status()).toContain('follows the wide layout');
  });

  it('Reset to default is a two-step action that restores the default and leaves favorites alone', () => {
    const { click, layout, el, fixture } = setup();
    TestBed.inject(FavoritesService).toggleTool('json');
    click('Remove Favorites');
    click('Save layout');
    expect(layout.customized()).toBe(true);

    click('Reset to default…');
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain('not affected');
    expect(layout.customized()).toBe(true); // nothing happens until confirmed
    click('Restore default');
    fixture.detectChanges();

    expect(layout.customized()).toBe(false);
    expect(el.querySelector('[data-panel-row="favorites"]')).not.toBeNull();
    expect(TestBed.inject(FavoritesService).isToolPinned('json')).toBe(true);
  });

  it('notes which panels are desktop-only on the web', () => {
    const { el } = setup(false);
    expect((el.querySelector('[data-panel-row="home-open-file"]') as HTMLElement).textContent).toContain('not shown on the web');
  });

  it('edits user content in place through the shared editor', () => {
    const { el, fixture, click } = setup();
    click('Edit Text note');
    const title = el.querySelector('[data-panel-row="user-text"] input[type="text"]') as HTMLInputElement;
    title.value = 'My todo';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('Save layout');
    expect(TestBed.inject(HomeLayoutService).contentOf('user-text')).toMatchObject({ kind: 'text', title: 'My todo' });
  });

  it('offers a registered fixture kind in the add list and adds it, with no editor branching on kind', () => {
    const { el, click, rowIds, layout } = setup(false, [{ provide: PANEL_DEFINITIONS_TOKEN, useValue: [...PANEL_DEFINITIONS, FIXTURE_KIND] }]);
    const picker = el.querySelector('#home-layout-add-title')!.closest('section') as HTMLElement;
    expect(picker.textContent).toContain('Fixture kind');
    expect(picker.textContent).toContain('Test-only panel kind.');
    expect(rowIds()).not.toContain('fixture-kind');

    click('Add Fixture kind');
    expect(rowIds()).toContain('fixture-kind');
    click('Save layout');
    expect(layout.layout().instances.some((i) => i.kindId === 'fixture-kind')).toBe(true);
  });

  it('does not offer the fixture kind when it is not registered', () => {
    const { el } = setup();
    expect(el.textContent).not.toContain('Fixture kind');
  });

  it('moves a panel later and earlier from the list form with native, focusable buttons, and disables the ends', () => {
    const { el, rowIds, status, fixture } = setup();
    const [first, second] = rowIds();
    const button = (id: string | null, suffix: string) => el.querySelector(`[data-panel-row="${id}"] button[aria-label$=" ${suffix}"]`) as HTMLButtonElement;
    expect(button(first, 'earlier').disabled).toBe(true);

    // Native <button type="button">: in the tab order and activated by Enter/Space (which browsers map to click).
    const later = button(first, 'later');
    expect(later.type).toBe('button');
    expect(later.tabIndex).toBeGreaterThanOrEqual(0);
    later.focus();
    expect(document.activeElement).toBe(later);
    later.click();
    fixture.detectChanges();
    expect(rowIds().slice(0, 2)).toEqual([second, first]);
    expect(status()).toContain('Moved');

    button(first, 'earlier').click();
    fixture.detectChanges();
    expect(rowIds().slice(0, 2)).toEqual([first, second]);
  });

  it('removes a panel from the list form; Discard brings it back and nothing is saved', () => {
    const { click, rowIds, layout, unsaved } = setup();
    expect(rowIds()).toContain('smart-entry');
    click('Remove Smart Entry');
    expect(rowIds()).not.toContain('smart-entry');
    expect(unsaved.hasUnsavedChanges()).toBe(true);
    expect(layout.customized()).toBe(false);

    click('Discard changes');
    expect(rowIds()).toContain('smart-entry');
    expect(unsaved.hasUnsavedChanges()).toBe(false);
  });

  it('resizes through the number fields (change event), reports the new placement, and saves it', () => {
    const { el, fixture, status, click, layout } = setup();
    const row = el.querySelector('[data-panel-row="resume-work"]') as HTMLElement;
    const width = Array.from(row.querySelectorAll('input[type="number"]'))[2] as HTMLInputElement; // Width (cells)
    expect(width.value).toBe('6');
    width.value = '5'; // minW is 4, so shrinking is valid and cannot overlap
    width.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(status()).not.toMatch(/Overlaps/);
    expect(row.textContent).toContain('5×3 cells');
    click('Save layout');
    expect(layout.layout().wide.find((p) => p.id === 'resume-work')!.w).toBe(5);
  });

  it('refuses a resize below the panel minimum and changes nothing', () => {
    const { el, fixture, status, layout } = setup();
    const row = el.querySelector('[data-panel-row="resume-work"]') as HTMLElement;
    const width = Array.from(row.querySelectorAll('input[type="number"]'))[2] as HTMLInputElement;
    width.value = '1';
    width.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(status()).not.toBe('');
    expect(width.value).toBe('6');
    expect(layout.customized()).toBe(false);
  });
});
