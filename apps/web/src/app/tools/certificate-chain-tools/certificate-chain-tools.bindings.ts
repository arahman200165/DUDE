// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'certificate-chain-tools';
export const binding = {
    load: () => import('./certificate-chain-tools').then((m) => m.CertificateChainTools)
};
