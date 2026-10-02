// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'password-generator';
export const binding = {
    load: () => import('./password-generator').then((m) => m.PasswordGenerator)
};
