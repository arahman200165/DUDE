// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'certificate-watch-list';
export const binding = {
    load: () => import('./certificate-watch-list').then((m) => m.CertificateWatchListTool)
};
