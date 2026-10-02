import type { LlmChatMessage } from "@dude/contracts/shared/models/llm-chat.model";

/**
 * Pure, framework-free prompt-building and response-parsing for Regex
 * Tester's AI features (Phase 8 Stage 4) — kept separate from `regex.ts` so
 * the parsing logic (the part most worth testing) doesn't need a TestBed.
 */

const GENERATE_SYSTEM_PROMPT =
  'You generate JavaScript-flavor regular expressions from a plain-English description. ' +
  'Respond with ONLY a single JSON object of the exact shape {"pattern": string, "flags": string}, ' +
  'no markdown code fences, no explanation, no extra text. "pattern" is the regex body without ' +
  'surrounding slashes. "flags" is a string of JS regex flags (e.g. "gi"), or an empty string if none apply.';

const EXPLAIN_SYSTEM_PROMPT =
  'You explain regular expressions in plain English for a developer audience. Be concise (a short ' +
  'paragraph or a few bullet points), focus on what the pattern actually matches, and call out any ' +
  'non-obvious behavior (greedy vs lazy quantifiers, lookarounds, backreferences).';

export function buildGenerateMessages(description: string): readonly LlmChatMessage[] {
  return [
    { role: 'system', content: GENERATE_SYSTEM_PROMPT },
    { role: 'user', content: description },
  ];
}

export function buildExplainMessages(pattern: string, flags: string): readonly LlmChatMessage[] {
  return [
    { role: 'system', content: EXPLAIN_SYSTEM_PROMPT },
    { role: 'user', content: `/${pattern}/${flags}` },
  ];
}

export type ParsedGeneratedPattern = { readonly ok: true; readonly pattern: string; readonly flags: string } | { readonly ok: false; readonly error: string };

export function parseGeneratedPattern(raw: string): ParsedGeneratedPattern {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return { ok: false, error: 'The AI response did not contain a recognizable pattern.' };
  }

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { pattern?: unknown; flags?: unknown };
    if (typeof parsed.pattern !== 'string' || parsed.pattern === '') {
      return { ok: false, error: 'The AI response did not contain a recognizable pattern.' };
    }
    return { ok: true, pattern: parsed.pattern, flags: typeof parsed.flags === 'string' ? parsed.flags : '' };
  } catch {
    return { ok: false, error: 'The AI response was not valid JSON.' };
  }
}
