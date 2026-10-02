import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'tree-search',
    title: 'Tree Search',
    description: 'Search every file under a folder: ripgrep-style text/regex with context, files by name/size/date/type, and JSONPath, JMESPath, YAML and XPath queries — with previewed replace across files.',
    category: 'text',
    keywords: ['grep', 'ripgrep', 'search files', 'find in files', 'regex', 'replace in files', 'find', 'jsonpath', 'xpath', 'yaml', 'metadata', 'empty files', 'content search'],
    route: '/tools/tree-search',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    consequenceClass: ['filesystem-write'],
    capabilities: [
        { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'searches real folders in the desktop fs worker' },
        { kind: 'platform', id: 'native-fs-write', web: 'unavailable', note: 'replaces across files only through a previewed, per-hunk, journaled plan' },
    ],
    io: { accepts: ['file', 'text'], produces: ['text', 'table'] }
};
