import { hostFetch } from "@dude/crypto/host";
/**
 * Grammar checking via the public LanguageTool API
 * (https://api.languagetool.org/v2/check — CORS-enabled, no key required
 * for reasonable usage). Follows the same `fetch`-with-network-caveat
 * pattern as `jwt-verify-logic.ts`'s JWKS mode.
 */

export interface GrammarMatch {
  readonly offset: number;
  readonly length: number;
  readonly message: string;
  readonly shortMessage: string;
  readonly replacements: readonly string[];
  readonly ruleId: string;
}

export type GrammarCheckResult = { readonly ok: true; readonly matches: readonly GrammarMatch[] } | { readonly ok: false; readonly error: string };

interface LanguageToolResponse {
  readonly matches?: readonly {
    readonly offset: number;
    readonly length: number;
    readonly message: string;
    readonly shortMessage?: string;
    readonly replacements?: readonly { readonly value: string }[];
    readonly rule?: { readonly id?: string };
  }[];
}

export async function checkGrammar(text: string, language = 'auto'): Promise<GrammarCheckResult> {
  if (text.trim() === '') return { ok: false, error: 'Enter some text to check.' };

  let response: Response;
  try {
    response = await hostFetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text, language }),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      return { ok: false, error: 'Could not reach LanguageTool — this may be a network issue or a CORS block.' };
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Grammar check failed.' };
  }

  if (!response.ok) return { ok: false, error: `LanguageTool request failed (HTTP ${response.status}).` };

  const body: LanguageToolResponse = await response.json().catch(() => ({ matches: [] }));
  const matches = (body.matches ?? []).map((m) => ({
    offset: m.offset,
    length: m.length,
    message: m.message,
    shortMessage: m.shortMessage || m.message,
    replacements: (m.replacements ?? []).map((r) => r.value),
    ruleId: m.rule?.id ?? '',
  }));

  return { ok: true, matches };
}
