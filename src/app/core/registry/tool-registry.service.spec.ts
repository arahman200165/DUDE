import { TestBed } from '@angular/core/testing';
import { TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { ToolRegistryService, validateDefinitions } from './tool-registry.service';

describe('ToolRegistryService', () => {
  let service: ToolRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToolRegistryService);
  });

  it('resolves getByRoute for both slash forms', () => {
    expect(service.getByRoute('/tools/json')?.id).toBe('json');
    expect(service.getByRoute('tools/json')?.id).toBe('json');
  });

  // A tool URL with a query or fragment (bookmarks, share links, anchors) must still resolve.
  // Before Phase 26 it didn't, and ToolShell lost its title and badges on such URLs.
  it('ignores a query string or fragment in getByRoute', () => {
    expect(service.getByRoute('/tools/json?x=1')?.id).toBe('json');
    expect(service.getByRoute('/tools/json#section-2')?.id).toBe('json');
    expect(service.getByRoute('/tools/json?x=1#frag')?.id).toBe('json');
  });

  it('groups the JSON tool under the data category', () => {
    const grouped = service.groupedByCategory();
    expect(grouped['data'].map((t) => t.id)).toContain('json');
  });

  it('declares a session-only input policy for JSON (private JSON should not persist across sessions)', () => {
    expect(service.getById('json')?.persistence?.input).toBe('session');
  });

  it('returns an array for every declared category, not just ones with tools', () => {
    const grouped = service.groupedByCategory();
    for (const category of TOOL_CATEGORIES) {
      expect(Array.isArray(grouped[category])).toBe(true);
    }
  });

  it('requiresNetwork is false for tools with no declared network policy', () => {
    expect(service.requiresNetwork('json')).toBe(false);
    expect(service.requiresNetwork('base64')).toBe(false);
  });

  it('requiresNetwork is false for an unknown tool id', () => {
    expect(service.requiresNetwork('does-not-exist')).toBe(false);
  });

  it('requiresNetwork is true for Text Inspector (grammar checking calls a public API)', () => {
    expect(service.requiresNetwork('text-inspector')).toBe(true);
  });
});

describe('validateDefinitions', () => {
  const noop = () => Promise.resolve();

  it('logs an error for a duplicate id', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const duplicates: ToolDefinition[] = [
      {
        id: 'a',
        title: 'A',
        description: '',
        category: 'data',
        keywords: [],
        route: '/tools/a',
        load: noop,
        io: { accepts: ['text'], produces: ['text'] },
      },
      {
        id: 'a',
        title: 'A2',
        description: '',
        category: 'text',
        keywords: [],
        route: '/tools/a2',
        load: noop,
        io: { accepts: ['text'], produces: ['text'] },
      },
    ];

    validateDefinitions(duplicates);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs an error for a duplicate route', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const duplicates: ToolDefinition[] = [
      {
        id: 'a',
        title: 'A',
        description: '',
        category: 'data',
        keywords: [],
        route: '/tools/x',
        load: noop,
        io: { accepts: ['text'], produces: ['text'] },
      },
      {
        id: 'b',
        title: 'B',
        description: '',
        category: 'text',
        keywords: [],
        route: '/tools/x',
        load: noop,
        io: { accepts: ['text'], produces: ['text'] },
      },
    ];

    validateDefinitions(duplicates);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not log for a valid definition set', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const valid: ToolDefinition[] = [
      {
        id: 'a',
        title: 'A',
        description: '',
        category: 'data',
        keywords: [],
        route: '/tools/a',
        load: noop,
        io: { accepts: ['text'], produces: ['text'] },
      },
    ];

    validateDefinitions(valid);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
