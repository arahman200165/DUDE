// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'escape-unescape-toolkit';
export const binding = {
    load: () => import('./escape-unescape-toolkit').then((m) => m.EscapeUnescapeToolkit)
};
