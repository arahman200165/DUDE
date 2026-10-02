import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'regex-flavor-converter',
    title: 'Regex Flavor Converter',
    description: 'Translates a regex pattern between JavaScript, Python, Java, .NET, PCRE, and Go RE2 syntax, flagging constructs the target flavor cannot represent.',
    category: 'developer',
    keywords: [
        'regex',
        'regexp',
        'flavor',
        'convert',
        'pcre',
        'python',
        'java',
        'dotnet',
        'go re2',
        'translate',
    ],
    route: '/tools/regex-flavor-converter',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Round-trip tested simple literals through Python and JavaScript regex syntax with fixed-seed fast-check.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
