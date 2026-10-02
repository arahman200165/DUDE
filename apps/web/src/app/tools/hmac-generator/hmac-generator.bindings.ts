// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'hmac-generator';
export const binding = {
    load: () => import('./hmac-generator').then((m) => m.HmacGenerator)
};
