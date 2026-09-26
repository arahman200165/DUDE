import type { ToolDefinition } from '../../shared/models/tool-definition.model';

export const manifest: ToolDefinition = {
  id: 'k8s-cronjob-tester',
  title: 'Kubernetes CronJob Schedule Tester',
  shortTitle: 'K8s CronJob Tester',
  description:
    "Extracts a CronJob's schedule from a pasted manifest (or accepts a bare cron expression) and shows its next run times.",
  category: 'developer',
  keywords: ['kubernetes', 'k8s', 'cronjob', 'cron', 'schedule', 'test'],
  route: '/tools/k8s-cronjob-tester',
  load: () => import('./k8s-cronjob-tester').then((m) => m.K8sCronjobTester),
  status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
