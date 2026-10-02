// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'js-playground';
export const binding = {
    load: () => import('./js-playground').then((m) => m.JsPlayground)
};
