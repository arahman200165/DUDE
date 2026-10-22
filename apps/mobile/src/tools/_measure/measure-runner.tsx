import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { decodeBase64, encodeBase64 } from '@dude/crypto/base64-codec';
import { CASE_STYLE_OPTIONS, convertCase } from '@dude/tool-engine/tools/case-converter/case-convert';
import { detectLanguage } from '@dude/tool-engine/tools/text-inspector/language-detect';
import { computeReadability } from '@dude/tool-engine/tools/text-inspector/readability';
import { computeTextMetrics } from '@dude/tool-engine/tools/text-inspector/text-metrics';
import { runOffThread } from '../../kit/off-thread';
import { Label } from '../../ui/primitives';
import { csvParseTask } from '../csv-viewer/csv-viewer-task';
import { MAX_RENDERED_ROWS } from '../csv-viewer/csv-viewer-mobile';
import { diffTask } from '../diff/diff-task';
import { COMPUTED_ALGORITHMS } from '../hash/hash-mobile';
import { hashTask } from '../hash/hash-task';
import { formatTask } from '../json/json-task';
import { runRegex } from '../regex/regex-mobile';
import { xmlFormatTask } from '../xml-formatter/xml-formatter-task';
import { convertTask } from '../yaml-json/yaml-json-task';
import {
  CSV_CAP, DIFF_SIDE_CAP, HASH_CAP, JSON_CAP, MAIN_THREAD_CAP, PERCENTS, REGEX_CAP, XML_CAP, YAML_CAP,
  csvText, diffTexts, jsonText, proseText, sizeAt, xmlText, yamlText,
} from './measure-data';

/**
 * Build-flagged (EXPO_PUBLIC_DUDE_MEASURE=1) measurement harness, reached through dude://dev/measure. It runs the REAL off-thread tasks
 * and the real main-thread engine calls against deterministic inputs at 25, 50 and 100 percent of each tool's cap and logs one
 * `DUDE_MEASURE {json}` line per run, then `DUDE_MEASURE_DONE`. Scopes: all (default), smoke (25 percent only), json-peak (only json at
 * 100 percent, then idle for a PSS read), idle (nothing, for a baseline PSS read) and sweep (smaller sizes, 3 to 75 percent, to find the
 * largest size that meets a budget).
 */
const TICK_MS = 10;
const SETTLE_MS = 60;
const SWEEP_PERCENTS = [3.125, 6.25, 12.5, 37.5, 75] as const;

interface RunOutcome { readonly ok: boolean; readonly resultBytes: number }
interface Plan {
  readonly tool: string; readonly variant: string; readonly thread: 'worker' | 'main'; readonly percent: number; readonly cap: number;
  /** Builds the input outside the timed region and returns the timed run plus the input size in characters (ASCII, so bytes). */
  readonly prepare: (size: number) => { readonly inputBytes: number; readonly run: () => Promise<RunOutcome> | RunOutcome };
}
export interface MeasureRow {
  readonly tool: string; readonly variant: string; readonly thread: 'worker' | 'main'; readonly percent: number; readonly inputBytes: number;
  readonly wallMs: number; readonly maxTickGapMs: number; readonly ok: boolean; readonly resultBytes: number; readonly warmup: boolean;
}

const now = (): number => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const bytesOf = (value: unknown): number => { try { return JSON.stringify(value)?.length ?? 0; } catch { return -1; } };

/** Largest gap between two consecutive JS timer ticks (the interval itself included), so about TICK_MS means the JS thread was free. */
function startTicks(): () => number {
  let last = now();
  let max = 0;
  const id = setInterval(() => { const current = now(); max = Math.max(max, current - last); last = current; }, TICK_MS);
  return () => { max = Math.max(max, now() - last); clearInterval(id); return max; };
}

async function measureOne(plan: Plan, size: number, warmup: boolean): Promise<MeasureRow> {
  const { inputBytes, run } = plan.prepare(size);
  await pause(SETTLE_MS);
  const stopTicks = startTicks();
  await pause(SETTLE_MS);
  const started = now();
  let outcome: RunOutcome;
  try { outcome = await run(); } catch (error) { outcome = { ok: false, resultBytes: -1 }; console.log(`DUDE_MEASURE_ERROR ${plan.tool}/${plan.variant}: ${error instanceof Error ? error.message : String(error)}`); }
  const wallMs = now() - started;
  const maxTickGapMs = stopTicks();
  return { tool: plan.tool, variant: plan.variant, thread: plan.thread, percent: warmup ? 0 : plan.percent, inputBytes, wallMs: Math.round(wallMs), maxTickGapMs: Math.round(maxTickGapMs), ok: outcome.ok, resultBytes: outcome.resultBytes, warmup };
}

const worker = (tool: string, variant: string, cap: number, percent: number, prepare: Plan['prepare']): Plan => ({ tool, variant, thread: 'worker', percent, cap, prepare });
const main = (tool: string, variant: string, cap: number, percent: number, prepare: Plan['prepare']): Plan => ({ tool, variant, thread: 'main', percent, cap, prepare });
const okOf = (result: unknown): boolean => (result as { ok?: boolean } | null)?.ok !== false;

function plansFor(percent: number, scope: string): Plan[] {
  const plans: Plan[] = [];
  const jsonPlan = worker('json', 'pretty', JSON_CAP, percent, size => {
    const text = jsonText(size);
    return { inputBytes: text.length, run: async () => { const result = await runOffThread(formatTask, { input: text, mode: 'pretty', indent: 2 }); return { ok: okOf(result), resultBytes: bytesOf(result) }; } };
  });
  if (scope === 'json-peak') return percent === 100 ? [jsonPlan] : [];
  if (scope === 'idle') return [];
  plans.push(worker('hash', 'all-algorithms', HASH_CAP, percent, size => {
    const text = proseText(size);
    return { inputBytes: text.length, run: async () => { const result = await runOffThread(hashTask, { text, algorithms: COMPUTED_ALGORITHMS }); return { ok: Array.isArray(result) && result.length > 0, resultBytes: bytesOf(result) }; } };
  }));
  plans.push(jsonPlan);
  plans.push(worker('yaml-json', 'yaml-to-json', YAML_CAP, percent, size => {
    const text = yamlText(size);
    return { inputBytes: text.length, run: async () => { const result = await runOffThread(convertTask, { input: text, direction: 'yaml-to-json', indent: 2 }); return { ok: okOf(result), resultBytes: bytesOf(result) }; } };
  }));
  plans.push(worker('yaml-json', 'json-to-yaml', YAML_CAP, percent, size => {
    const text = jsonText(size);
    return { inputBytes: text.length, run: async () => { const result = await runOffThread(convertTask, { input: text, direction: 'json-to-yaml', indent: 2 }); return { ok: okOf(result), resultBytes: bytesOf(result) }; } };
  }));
  plans.push(worker('xml-formatter', 'format', XML_CAP, percent, size => {
    const text = xmlText(size);
    return { inputBytes: text.length, run: async () => { const result = await runOffThread(xmlFormatTask, { input: text, mode: 'format', indent: 2 }); return { ok: okOf(result), resultBytes: bytesOf(result) }; } };
  }));
  plans.push(worker('csv-viewer', 'parse-header-comma', CSV_CAP, percent, size => {
    const text = csvText(size);
    return { inputBytes: text.length, run: async () => { const result = await runOffThread(csvParseTask, { input: text, delimiter: ',', hasHeaderRow: true, maxRows: MAX_RENDERED_ROWS }); return { ok: okOf(result), resultBytes: bytesOf(result) }; } };
  }));
  plans.push(worker('diff', 'line-diff', DIFF_SIDE_CAP, percent, size => {
    const { left, right } = diffTexts(size);
    return { inputBytes: left.length + right.length, run: async () => { const result = await runOffThread(diffTask, { left, right }); return { ok: result.added + result.removed > 0, resultBytes: bytesOf(result) }; } };
  }));
  // Worst case for the line diff: no line in common, so the engine cannot shortcut on shared prefixes or suffixes.
  plans.push(worker('diff', 'line-diff-disjoint', DIFF_SIDE_CAP, percent, size => {
    const { left } = diffTexts(size);
    const { left: right } = diffTexts(size, 77);
    return { inputBytes: left.length + right.length, run: async () => { const result = await runOffThread(diffTask, { left, right }); return { ok: result.added + result.removed > 0, resultBytes: bytesOf(result) }; } };
  }));
  plans.push(main('base64', 'encode', MAIN_THREAD_CAP, percent, size => {
    const text = proseText(size);
    return { inputBytes: text.length, run: () => { const result = encodeBase64(text); return { ok: result.ok, resultBytes: result.ok ? result.value.length : -1 }; } };
  }));
  plans.push(main('base64', 'decode', MAIN_THREAD_CAP, percent, size => {
    const encoded = encodeBase64(proseText(Math.floor(size * 3 / 4)));
    const text = encoded.ok ? encoded.value : '';
    return { inputBytes: text.length, run: () => { const result = decodeBase64(text); return { ok: result.ok, resultBytes: result.ok ? result.value.length : -1 }; } };
  }));
  for (const option of CASE_STYLE_OPTIONS) {
    if (percent !== 100 && option.style !== 'camel' && option.style !== 'alternating') continue;
    plans.push(main('case-converter', option.style, MAIN_THREAD_CAP, percent, size => {
      const text = proseText(size);
      return { inputBytes: text.length, run: () => ({ ok: true, resultBytes: convertCase(text, option.style).length }) };
    }));
  }
  plans.push(main('text-inspector', 'metrics', MAIN_THREAD_CAP, percent, size => {
    const text = proseText(size);
    return { inputBytes: text.length, run: () => ({ ok: true, resultBytes: bytesOf(computeTextMetrics(text)) }) };
  }));
  plans.push(main('text-inspector', 'readability', MAIN_THREAD_CAP, percent, size => {
    const text = proseText(size);
    return { inputBytes: text.length, run: () => { const score = computeReadability(text); return { ok: score !== null, resultBytes: bytesOf(score) }; } };
  }));
  plans.push(main('text-inspector', 'language', MAIN_THREAD_CAP, percent, size => {
    const text = proseText(size);
    return { inputBytes: text.length, run: () => { const guesses = detectLanguage(text); return { ok: guesses.length > 0, resultBytes: bytesOf(guesses) }; } };
  }));
  plans.push(main('regex', 'match-words-g', REGEX_CAP, percent, size => {
    const text = proseText(size);
    return { inputBytes: text.length, run: () => { const outcome = runRegex({ kind: 'match', pattern: '\\b[a-z]+\\b', flags: 'g', text }); return { ok: outcome.status === 'matches', resultBytes: bytesOf(outcome) }; } };
  }));
  plans.push(main('regex', 'replace-words-g', REGEX_CAP, percent, size => {
    const text = proseText(size);
    return { inputBytes: text.length, run: () => { const outcome = runRegex({ kind: 'replace', pattern: '\\b([a-z])([a-z]*)\\b', flags: 'g', text, replacement: '$2$1' }); return { ok: outcome.status === 'replaced', resultBytes: bytesOf(outcome) }; } };
  }));
  return plans;
}

async function runAll(scope: string, report: (row: MeasureRow) => void): Promise<number> {
  const percents: readonly number[] = scope === 'smoke' ? [25] : scope === 'sweep' ? SWEEP_PERCENTS : PERCENTS;
  let count = 0;
  // A tiny warm-up per tool/variant records the one-time cost (worker runtime creation, lazy module evaluation) separately.
  const warmed = new Set<string>();
  for (const percent of percents) {
    for (const plan of plansFor(percent, scope)) {
      const key = `${plan.tool}/${plan.variant}`;
      if (plan.thread === 'worker' && !warmed.has(key)) {
        warmed.add(key);
        report(await measureOne(plan, Math.max(1024, Math.floor(plan.cap / 1024)), true));
        count++;
      }
      report(await measureOne(plan, sizeAt(plan.cap, percent), false));
      count++;
    }
  }
  return count;
}

export default function MeasureRunner() {
  const { scope: rawScope } = useLocalSearchParams<{ scope?: string }>();
  const scope = typeof rawScope === 'string' && ['all', 'smoke', 'json-peak', 'idle', 'sweep'].includes(rawScope) ? rawScope : 'all';
  const [lines, setLines] = useState<readonly string[]>([]);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    console.log(`DUDE_MEASURE_START ${JSON.stringify({ scope, api: Platform.Version, os: Platform.OS })}`);
    void runAll(scope, row => {
      console.log(`DUDE_MEASURE ${JSON.stringify({ scope, api: Platform.Version, ...row })}`);
      if (active) setLines(previous => [...previous, `${row.tool}/${row.variant} ${row.warmup ? 'warmup' : `${row.percent}%`} ${row.wallMs} ms gap ${row.maxTickGapMs} ms ${row.ok ? 'ok' : 'FAILED'}`]);
    }).then(async count => {
      // Let the final PSS read see the post-run heap, not the run itself.
      await pause(1500);
      console.log(`DUDE_MEASURE_DONE ${JSON.stringify({ scope, runs: count })}`);
      if (active) setDone(true);
    });
    return () => { active = false; };
  }, [scope]);
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 4 }}>
    <Label testID="measure-status" accessibilityRole="header">{done ? `done (${scope})` : `measuring (${scope})...`}</Label>
    <View>{lines.map((line, index) => <Label key={index} mono muted>{line}</Label>)}</View>
  </ScrollView>;
}
