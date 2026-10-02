// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'css-selector-tester';
export const binding = {
    load: () => import('./css-selector-tester').then((m) => m.CssSelectorTester)
};
