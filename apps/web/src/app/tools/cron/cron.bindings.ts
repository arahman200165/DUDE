// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'cron';
export const binding = {
    load: () => import('./cron').then((m) => m.Cron)
};
