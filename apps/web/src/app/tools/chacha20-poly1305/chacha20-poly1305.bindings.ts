// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'chacha20-poly1305';
export const binding = {
    load: () => import('./chacha20-poly1305').then((m) => m.Chacha20Poly1305)
};
