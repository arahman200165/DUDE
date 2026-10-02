// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'aes-encrypt-decrypt';
export const binding = {
    load: () => import('./aes-encrypt-decrypt').then((m) => m.AesEncryptDecrypt)
};
