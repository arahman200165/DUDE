// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'html-jsx-converter';
export const binding = {
    load: () => import('./html-jsx-converter').then((m) => m.HtmlJsxConverter)
};
