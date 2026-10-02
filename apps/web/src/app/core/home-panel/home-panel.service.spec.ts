import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PersistenceService } from '../persistence/persistence.service';
import { MAX_LINKS, MAX_NOTE_CHARS } from "@dude/domain/core/home-panel/home-panel.model";
import { HomePanelService } from './home-panel.service';

const KEY = 'dude:v1:__home__:panel';
const stable = () => TestBed.inject(ApplicationRef).whenStable();

describe('HomePanelService', () => {
  let service: HomePanelService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(HomePanelService);
  });

  it('starts empty', () => {
    expect(service.hasContent()).toBe(false);
    expect(service.note()).toBe('');
    expect(service.links()).toEqual([]);
  });

  it('stores a bounded note', () => {
    service.setNote('hello');
    expect(service.note()).toBe('hello');
    service.setNote('x'.repeat(MAX_NOTE_CHARS + 50));
    expect(service.note()).toHaveLength(MAX_NOTE_CHARS);
    expect(service.hasContent()).toBe(true);
  });

  it('adds valid links, rejects unsafe, duplicate and excess links, and removes by id', () => {
    expect(service.addLink('Docs', 'https://example.com')).toEqual({ ok: true });
    expect(service.addLink('Bad', 'javascript:alert(1)')).toMatchObject({ ok: false });
    expect(service.addLink('Again', 'https://example.com/')).toMatchObject({ ok: false, error: 'That link is already saved.' });
    expect(service.links()).toHaveLength(1);

    for (let i = 1; i < MAX_LINKS; i++) service.addLink(`L${i}`, `https://example.com/${i}`);
    expect(service.links()).toHaveLength(MAX_LINKS);
    expect(service.addLink('Extra', 'https://extra.example.com')).toMatchObject({ ok: false });

    service.removeLink(service.links()[0].id);
    expect(service.links()).toHaveLength(MAX_LINKS - 1);
  });

  it('persists to local storage under the __home__ namespace and survives a fresh instance', async () => {
    service.setNote('remember me');
    service.addLink('Docs', 'https://example.com');
    await stable();

    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ schemaVersion: 1, note: 'remember me' });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(HomePanelService);
    expect(fresh.note()).toBe('remember me');
    expect(fresh.links()).toHaveLength(1);
  });

  it('is removed by PersistenceService.clearAll() (Clear all local data)', async () => {
    service.setNote('gone soon');
    await stable();
    expect(localStorage.getItem(KEY)).not.toBeNull();

    TestBed.inject(PersistenceService).clearAll();

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('sanitizes a tampered stored value on load', () => {
    localStorage.setItem(KEY, JSON.stringify({ schemaVersion: 1, note: 'ok', links: [{ id: 'a', label: 'x', url: 'javascript:alert(1)' }] }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const loaded = TestBed.inject(HomePanelService);

    expect(loaded.note()).toBe('ok');
    expect(loaded.links()).toEqual([]);
  });

  it('importContent re-sanitizes whatever it is given', () => {
    service.importContent({ note: 'n', links: [{ id: 'a', label: 'x', url: 'data:text/html,hi' }] });
    expect(service.note()).toBe('n');
    expect(service.links()).toEqual([]);
  });
});
