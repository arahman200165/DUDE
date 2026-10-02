// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'docker-run-compose-converter';
export const binding = {
    load: () => import('./docker-run-compose-converter').then((m) => m.DockerRunComposeConverter)
};
