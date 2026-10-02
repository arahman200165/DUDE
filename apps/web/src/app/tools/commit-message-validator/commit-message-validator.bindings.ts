// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'commit-message-validator';
export const binding = {
    load: () => import('./commit-message-validator').then((m) => m.CommitMessageValidator)
};
