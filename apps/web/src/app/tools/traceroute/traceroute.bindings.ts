// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'traceroute';
export const binding = {
    load: () => import('./traceroute').then((m) => m.TracerouteTool)
};
