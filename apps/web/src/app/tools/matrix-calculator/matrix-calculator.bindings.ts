// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'matrix-calculator';
export const binding = {
    load: () => import('./matrix-calculator').then((m) => m.MatrixCalculatorTool)
};
