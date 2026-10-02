// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'udp-port-tester';
export const binding = {
    load: () => import('./udp-port-tester').then((m) => m.UdpPortTesterTool)
};
