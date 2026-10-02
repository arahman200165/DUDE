// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'docker-compose-validator';
export const binding = {
    load: () => import('./docker-compose-validator').then((m) => m.DockerComposeValidator)
};
