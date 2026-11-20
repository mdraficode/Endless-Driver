import { describe, expect, it } from 'vitest';

import { BLACKLIST_RIVALS } from '../../src/config/most-wanted';
import { computeCeiling } from '../../src/most-wanted/HeatModel';
import {
  applyRaceWin,
  initialCampaignState,
  nextEligibleRival,
  raceWinReward,
  rivalsBustedCount,
} from '../../src/most-wanted/BlacklistCampaign';

describe('Most Wanted — Blacklist campaign (M5b)', () => {
  it('starts with no rivals busted and a 0 career total', () => {
    const state = initialCampaignState();
    expect(state.bustedRanks).toEqual([]);
    expect(state.careerTotal).toBe(0);
    expect(rivalsBustedCount(state)).toBe(0);
    // D2 ceiling with nobody busted is the base (1).
    expect(computeCeiling(rivalsBustedCount(state))).toBe(1);
  });

  it('the first eligible rival is rank 15 (threshold 0) — challengeable from a fresh career', () => {
    const rival = nextEligibleRival(initialCampaignState(), BLACKLIST_RIVALS);
    expect(rival).not.toBeNull();
    expect(rival!.rank).toBe(15); // the first you challenge
  });

  it('winning busts the rival, banks the bounty, and raises the D2 ceiling', () => {
    const state = initialCampaignState();
    const rival = nextEligibleRival(state, BLACKLIST_RIVALS)!;
    const after = applyRaceWin(state, rival.rank);
    // The rival is busted → the ceiling rises from 1 to 2 (D2).
    expect(after.bustedRanks).toContain(15);
    expect(rivalsBustedCount(after)).toBe(1);
    expect(computeCeiling(rivalsBustedCount(after))).toBe(2);
    // The win bounty banked into the career total (D3).
    expect(after.careerTotal).toBe(raceWinReward(15));
    expect(after.careerTotal).toBeGreaterThan(0);
  });

  it('after busting rank 15, the next rival is rank 14 only once its threshold is met', () => {
    const afterRank15 = applyRaceWin(initialCampaignState(), 15);
    // Rank 14 needs a 5000 career total; the rank-15 win (9500) clears it → rank 14 is up next.
    expect(nextEligibleRival(afterRank15, BLACKLIST_RIVALS)!.rank).toBe(14);
  });

  it('a rival whose threshold is unmet is not yet challengeable (D3 gate holds)', () => {
    // Rank 15 busted with a 0 career total: rank 14 needs 5000, so nothing is eligible.
    expect(nextEligibleRival({ bustedRanks: [15], careerTotal: 0 }, BLACKLIST_RIVALS)).toBeNull();
    // Once the career total clears rank 14's 5000, rank 14 is up next.
    expect(
      nextEligibleRival({ bustedRanks: [15], careerTotal: 5000 }, BLACKLIST_RIVALS)!.rank,
    ).toBe(14);
    // And with rank 14 busted too, rank 13 needs 60000 — still locked at 5000.
    expect(
      nextEligibleRival({ bustedRanks: [15, 14], careerTotal: 5000 }, BLACKLIST_RIVALS),
    ).toBeNull();
  });

  it('a tougher rival is worth more (win reward grows as the rank falls)', () => {
    expect(raceWinReward(1)).toBeGreaterThan(raceWinReward(8));
    expect(raceWinReward(8)).toBeGreaterThan(raceWinReward(15));
  });

  it('applying a win twice for the same rank is idempotent (no double-count)', () => {
    const once = applyRaceWin(initialCampaignState(), 15);
    const twice = applyRaceWin(once, 15);
    expect(twice.bustedRanks.filter((r) => r === 15)).toHaveLength(1);
    expect(rivalsBustedCount(twice)).toBe(rivalsBustedCount(once));
  });
});
