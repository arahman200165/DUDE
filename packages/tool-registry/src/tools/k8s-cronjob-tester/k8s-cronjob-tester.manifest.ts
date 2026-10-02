import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'k8s-cronjob-tester',
    title: 'Kubernetes CronJob Schedule Tester',
    shortTitle: 'K8s CronJob Tester',
    description: "Extracts a CronJob's schedule from a pasted manifest (or accepts a bare cron expression) and shows its next run times.",
    category: 'developer',
    keywords: ['kubernetes', 'k8s', 'cronjob', 'cron', 'schedule', 'test'],
    route: '/tools/k8s-cronjob-tester',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested arbitrary manifest/schedule extraction and schedule testing for crash safety with fast-check.',
    },
    persistence: { input: 'session', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text'] }
};
