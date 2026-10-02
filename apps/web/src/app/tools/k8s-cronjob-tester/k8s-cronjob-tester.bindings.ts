// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'k8s-cronjob-tester';
export const binding = {
    load: () => import('./k8s-cronjob-tester').then((m) => m.K8sCronjobTester)
};
