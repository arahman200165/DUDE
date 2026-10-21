// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'device-info';
export const binding = {
    load: () => import('./device-info').then((m) => m.DeviceInfo)
};
