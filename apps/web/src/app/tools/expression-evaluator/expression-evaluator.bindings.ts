// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'expression-evaluator';
export const binding = {
    load: () => import('./expression-evaluator').then((m) => m.ExpressionEvaluator)
};
