// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'reverse-dns';
export const binding = {
    load: () => import('./reverse-dns').then((m) => m.ReverseDnsTool)
};
