import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeLayoutService } from '../../../core/home-layout/home-layout.service';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { PlatformService } from '../../../core/platform/platform.service';
import { SettingsUnsavedChanges } from '../settings-unsaved-changes';
import { HomeLayoutSettings } from './home-layout-settings';

function setup(desktop = false) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: PlatformService, useValue: { isDesktop: () => desktop } }] });
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
});
