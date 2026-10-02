// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ping';
export const binding = {
    load: () => import('./ping').then((m) => m.PingTool)
};
