// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'rich-text-editor';
export const binding = {
    load: () => import('./rich-text-editor').then((m) => m.RichTextEditor)
};
