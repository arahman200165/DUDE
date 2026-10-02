/**
 * Standalone, phase-agnostic "Recommended" ranking (DUDE_PRD.md §21 Phase 30A.4) — deliberately not
 * coupled to Browse Tools itself, so Phase 30D (Bounded Default Home) and Phase 30G (Quick Run on
 * Home) can import `scoreForRecommendation` directly rather than re-deriving their own scorer later.
 * Every signal is local (favorite/usage/recency/context), explainable, and weighted by a fixed,
 * documented table — no ML, no remote calls, no telemetry.
 */
export interface RecommendationSignals {
  readonly isFavorite: boolean;
  /** Total times opened (`UsageService.frequencyOf`). */
  readonly frequency: number;
  /** 0 = most recently opened, `Infinity` if never opened (`UsageService.mostRecent`'s index). */
  readonly recentRank: number;
  /** True when the tool's category matches the caller's current category focus, if any. */
  readonly matchesActiveCategory: boolean;
  /** True when the tool's declared `io` accepts/produces the caller's current input/output focus, if any. */
  readonly ioCompatible: boolean;
}

/** Points awarded per signal — tunable, but kept in one documented place rather than scattered. */
const WEIGHTS = {
  favorite: 50,
  categoryMatch: 20,
  ioCompatible: 15,
  /** Per open, capped so a single very-frequently-opened tool can't permanently dominate. */
  frequencyPerOpen: 2,
  frequencyCap: 20,
  /** Decays linearly with `recentRank`; a tool opened 13+ tools ago earns nothing from recency. */
  recencyMax: 25,
  recencyStep: 2,
} as const;

export function scoreForRecommendation(signals: RecommendationSignals): number {
  let score = 0;
  if (signals.isFavorite) score += WEIGHTS.favorite;
  if (signals.matchesActiveCategory) score += WEIGHTS.categoryMatch;
  if (signals.ioCompatible) score += WEIGHTS.ioCompatible;
  score += Math.min(signals.frequency * WEIGHTS.frequencyPerOpen, WEIGHTS.frequencyCap);
  if (Number.isFinite(signals.recentRank)) {
    score += Math.max(WEIGHTS.recencyMax - signals.recentRank * WEIGHTS.recencyStep, 0);
  }
  return score;
}
