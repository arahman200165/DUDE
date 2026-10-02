// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'cookie-tools';
export const binding = {
    load: () => import('./cookie-tools').then((m) => m.CookieTools)
};
