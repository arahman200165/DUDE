// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'public-ip';
export const binding = {
    load: () => import('./public-ip').then((m) => m.PublicIpTool)
};
