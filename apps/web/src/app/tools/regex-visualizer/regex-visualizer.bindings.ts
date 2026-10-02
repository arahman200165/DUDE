// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'regex-visualizer';
export const binding = {
    load: () => import('./regex-visualizer').then((m) => m.RegexVisualizer)
};
