// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'contrast-checker';
export const binding = {
    load: () => import('./contrast-checker').then((m) => m.ContrastChecker)
};
