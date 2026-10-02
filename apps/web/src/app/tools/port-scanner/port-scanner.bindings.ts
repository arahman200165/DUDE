// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'port-scanner';
export const binding = {
    load: () => import('./port-scanner').then((m) => m.PortScannerTool)
};
