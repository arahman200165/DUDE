// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'tcp-port-tester';
export const binding = {
    load: () => import('./tcp-port-tester').then((m) => m.TcpPortTesterTool)
};
