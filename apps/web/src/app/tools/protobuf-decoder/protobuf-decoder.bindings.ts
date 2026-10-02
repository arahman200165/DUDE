// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'protobuf-decoder';
export const binding = {
    load: () => import('./protobuf-decoder').then((m) => m.ProtobufDecoder)
};
