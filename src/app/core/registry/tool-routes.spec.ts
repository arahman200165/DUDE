import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { buildToolRoutes, loadToolComponent, toRoutePath } from './tool-routes';
import { ToolLoadFailure } from '../../shared/components/tool-load-failure/tool-load-failure';
import { TOOL_DEFINITIONS } from './tool-definitions';

describe('toRoutePath', () => {
  it('strips a leading slash', () => {
    expect(toRoutePath('/tools/json')).toBe('tools/json');
  });

  it('leaves a path with no leading slash unchanged', () => {
    expect(toRoutePath('tools/json')).toBe('tools/json');
  });
});

describe('buildToolRoutes', () => {
  const definitions: ToolDefinition[] = [
    {
      id: 'json',
      title: 'JSON Formatter',
      description: 'Validate, format, and minify JSON.',
      category: 'data',
      keywords: ['json'],
      route: '/tools/json',
      load: () => Promise.resolve({}),
      io: { accepts: ['text'], produces: ['text'] },
    },
  ];

  it('produces a route path with the leading slash stripped', () => {
    const [route] = buildToolRoutes(definitions);
    expect(route.path).toBe('tools/json');
  });

  it('keeps loadComponent lazy instead of eagerly resolving the import', () => {
    const [route] = buildToolRoutes(definitions);
    expect(typeof route.loadComponent).toBe('function');
  });
});

describe('the real registry', () => {
  // `/tools` is the Browse Tools shell route (DUDE_PRD.md §21 Phase 30A.1) -- a manifest declaring
  // that bare path would collide with it. Individual tool routes live at `/tools/<id>`, a distinct
  // full-path literal Angular matches independently, so this is the only invariant worth guarding.
  it('never declares a bare "/tools" route for any tool manifest', () => {
    const bareRouteTools = TOOL_DEFINITIONS.filter((definition) => toRoutePath(definition.route) === 'tools');
    expect(bareRouteTools).toEqual([]);
  });
});

describe('loadToolComponent', () => {
  const base: ToolDefinition = {
    id: 'json',
    title: 'JSON Formatter',
    description: '',
    category: 'data',
    keywords: [],
    route: '/tools/json',
    load: () => Promise.resolve({}),
    io: { accepts: ['text'], produces: ['text'] },
  };

  it('resolves the tool component when its chunk loads', async () => {
    class Real {}
    await expect(loadToolComponent({ ...base, load: () => Promise.resolve(Real) })).resolves.toBe(Real);
  });

  it('falls back to the bundled ToolLoadFailure when the chunk fails to load (offline / stale deploy)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = { ...base, load: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')) };
    await expect(loadToolComponent(failing)).resolves.toBe(ToolLoadFailure);
    warn.mockRestore();
  });
});
