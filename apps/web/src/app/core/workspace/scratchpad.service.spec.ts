import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScratchpadService } from './scratchpad.service';

describe('ScratchpadService', () => {
  let service: ScratchpadService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ScratchpadService);
  });

  it('starts empty and collapsed', () => {
    expect(service.snippets()).toEqual([]);
    expect(service.drawerExpanded()).toBe(false);
  });

  it('adds a snippet to the front of the list', () => {
    service.addSnippet('First', 'body 1');
    service.addSnippet('Second', 'body 2', 'base64');

    expect(service.snippets().map((s) => s.title)).toEqual(['Second', 'First']);
    expect(service.snippets()[0].sourceToolId).toBe('base64');
  });

  it('updates a snippet in place', () => {
    const snippet = service.addSnippet('Title', 'body');
    service.updateSnippet(snippet.id, { title: 'Renamed' });

    expect(service.snippets()[0].title).toBe('Renamed');
    expect(service.snippets()[0].body).toBe('body');
  });

  it('removes a snippet by id', () => {
    const snippet = service.addSnippet('Title', 'body');
    service.removeSnippet(snippet.id);

    expect(service.snippets()).toEqual([]);
  });

  it('toggles the drawer', () => {
    service.toggleDrawer();
    expect(service.drawerExpanded()).toBe(true);
    service.toggleDrawer();
    expect(service.drawerExpanded()).toBe(false);
  });
});
