import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'css-selector-tester',
    title: 'CSS Selector Tester',
    description: 'Tests a CSS selector against sample HTML and lists every matched element in document order.',
    category: 'developer',
    keywords: ['css', 'selector', 'querySelectorAll', 'test selector', 'css selector tester'],
    route: '/tools/css-selector-tester',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'DOM-backed properties verify generated selector match counts, document order, and typed results for arbitrary HTML and selectors.',
    },
    persistence: { input: 'session', preferences: 'none' },
    fileInput: { key: 'html', extensions: ['.html', '.htm'] },
    io: { accepts: ['text', 'file'], produces: ['json'] }
};
