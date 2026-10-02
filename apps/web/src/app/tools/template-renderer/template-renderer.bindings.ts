// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'template-renderer';
export const binding = {
    load: () => import('./template-renderer').then((m) => m.TemplateRenderer)
};
