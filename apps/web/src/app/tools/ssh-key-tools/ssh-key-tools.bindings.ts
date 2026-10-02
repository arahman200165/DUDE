// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ssh-key-tools';
export const binding = {
    load: () => import('./ssh-key-tools').then((m) => m.SshKeyTools)
};
