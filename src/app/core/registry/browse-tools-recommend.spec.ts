import { scoreForRecommendation } from './browse-tools-recommend';

const NEUTRAL = { isFavorite: false, frequency: 0, recentRank: Infinity, matchesActiveCategory: false, ioCompatible: false };

describe('scoreForRecommendation', () => {
  it('scores a tool with no signals at all as zero', () => {
    expect(scoreForRecommendation(NEUTRAL)).toBe(0);
  });

  it('ranks a favorite above a non-favorite with otherwise identical signals', () => {
    expect(scoreForRecommendation({ ...NEUTRAL, isFavorite: true })).toBeGreaterThan(scoreForRecommendation(NEUTRAL));
  });

  it('ranks a more recently opened tool above a less recently opened one', () => {
    const recent = scoreForRecommendation({ ...NEUTRAL, recentRank: 0 });
    const older = scoreForRecommendation({ ...NEUTRAL, recentRank: 5 });
    expect(recent).toBeGreaterThan(older);
  });

  it('gives a never-opened tool no recency contribution', () => {
    expect(scoreForRecommendation({ ...NEUTRAL, recentRank: Infinity })).toBe(scoreForRecommendation(NEUTRAL));
  });

  it('caps the frequency contribution so a very frequently opened tool cannot dominate unboundedly', () => {
    const moderate = scoreForRecommendation({ ...NEUTRAL, frequency: 10 });
    const extreme = scoreForRecommendation({ ...NEUTRAL, frequency: 10_000 });
    expect(extreme).toBe(moderate);
  });

  it('rewards matching the active category and io compatibility independently', () => {
    expect(scoreForRecommendation({ ...NEUTRAL, matchesActiveCategory: true })).toBeGreaterThan(scoreForRecommendation(NEUTRAL));
    expect(scoreForRecommendation({ ...NEUTRAL, ioCompatible: true })).toBeGreaterThan(scoreForRecommendation(NEUTRAL));
  });
});
