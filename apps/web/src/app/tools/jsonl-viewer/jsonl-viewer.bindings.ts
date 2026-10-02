// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'jsonl-viewer';
export const binding = {
    load: () => import('./jsonl-viewer').then((m) => m.JsonlViewer)
};
