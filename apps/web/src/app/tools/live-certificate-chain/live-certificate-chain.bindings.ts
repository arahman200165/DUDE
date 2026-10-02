// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'live-certificate-chain';
export const binding = {
    load: () => import('./live-certificate-chain').then((m) => m.LiveCertificateChainTool)
};
