// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'msgpack-decoder';
export const binding = {
    load: () => import('./msgpack-decoder').then((m) => m.MsgpackDecoder)
};
