import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'statistics-calculator',
    title: 'Statistics Calculator',
    description: 'Count, sum, mean, median, mode, range, quartiles/IQR, and population/sample variance and standard deviation.',
    category: 'developer',
    keywords: [
        'statistics',
        'mean',
        'median',
        'mode',
        'standard deviation',
        'variance',
        'quartile',
        'iqr',
    ],
    route: '/tools/statistics-calculator',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): count, sum, minimum, maximum, and range agree with generated input lists.',
    },
    persistence: { input: 'session', preferences: 'none' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['json', 'text'] }
};
