// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'x509-certificate-inspector';
export const binding = {
    load: () => import('./x509-certificate-inspector').then((m) => m.X509CertificateInspector)
};
