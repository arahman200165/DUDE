// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'route-comparison';
export const binding = {
    load: () => import('./route-comparison').then((m) => m.RouteComparisonTool)
};
