import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomeLayoutService } from '../../core/home-layout/home-layout.service';
import { HomePanelService } from '../../core/home-panel/home-panel.service';
import { Deck } from './deck';

describe('Deck (Home)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

  it('offers an Edit Home entry point into the Home layout settings', () => {
    const fixture = TestBed.createComponent(Deck);
    fixture.detectChanges();
    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Edit Home');
    expect(link?.getAttribute('href')).toBe('/settings/home-layout');
  });

  it('moves legacy Notes & links content into the layout store when Home opens', () => {
    TestBed.inject(HomePanelService).setNote('from the old panel');
    const fixture = TestBed.createComponent(Deck);
    fixture.detectChanges();
    expect(TestBed.inject(HomeLayoutService).contentOf('user-text')).toMatchObject({ text: 'from the old panel' });
    expect(TestBed.inject(HomePanelService).hasContent()).toBe(false);
  });
});
