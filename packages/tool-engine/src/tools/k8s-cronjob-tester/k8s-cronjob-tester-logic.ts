/**
 * Pure, framework-free Kubernetes CronJob schedule testing. Thin wrapper: extracts
 * `spec.schedule` from a pasted CronJob manifest (or accepts a bare cron expression
 * directly) and hands it to the existing Cron Expression Parser's `parseCronExpression`
 * (`cron-parser` + `cronstrue`, already dependencies) rather than reimplementing cron math.
 */
import { load as loadYaml } from 'js-yaml';
import { parseCronExpression, type CronParseResult, type CronTimezoneMode } from "../cron/cron-parse.js";

export interface CronJobInfo {
  readonly schedule: string;
  readonly suspend: boolean;
  readonly concurrencyPolicy?: string;
}

export type ExtractCronJobResult = { readonly ok: true; readonly info: CronJobInfo } | { readonly ok: false; readonly error: string };

export function extractCronJobSchedule(input: string): ExtractCronJobResult {
  if (input.trim() === '') return { ok: false, error: 'Enter a CronJob manifest, or a bare schedule expression.' };

  let doc: unknown;
  try {
    doc = loadYaml(input);
  } catch {
    doc = undefined;
  }

  if (doc !== null && typeof doc === 'object' && !Array.isArray(doc)) {
    const spec = ((doc as Record<string, unknown>)['spec'] ?? {}) as Record<string, unknown>;
    const schedule = spec['schedule'];
    if (typeof schedule === 'string') {
      return {
        ok: true,
        info: {
          schedule,
          suspend: spec['suspend'] === true,
          concurrencyPolicy: typeof spec['concurrencyPolicy'] === 'string' ? spec['concurrencyPolicy'] : undefined,
        },
      };
    }
  }

  return { ok: true, info: { schedule: input.trim(), suspend: false } };
}

export type CronJobTestResult =
  | { readonly ok: true; readonly info: CronJobInfo; readonly result: CronParseResult }
  | { readonly ok: false; readonly error: string };

export function testCronJobSchedule(input: string, count: number, tz: CronTimezoneMode, now?: Date): CronJobTestResult {
  const extracted = extractCronJobSchedule(input);
  if (!extracted.ok) return extracted;

  return { ok: true, info: extracted.info, result: parseCronExpression(extracted.info.schedule, { count, tz, now }) };
}
