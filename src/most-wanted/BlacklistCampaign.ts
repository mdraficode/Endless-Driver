/**
 * Phase 10 Most Wanted — Milestone 5b: the **Blacklist campaign** career logic, the pure state.
 *
 * The 15-rival hunt-&-destroy campaign lives across a career: you bust rivals to (a) raise the
 * pursuit heat ceiling (D2: 1 + rivals busted) and (b) grow the career-total bounty that gates the
 * next rival (D3). This module is that bookkeeping, pure and Node-testable, so the Application
 * holds a live copy and the human-player simulation can drive a full campaign (challenge → win →
 * Pink Slip → next rival) without a browser.
 */
import type { BlacklistRivalConfig, RosterEntry } from './types';

/** The campaign's career state (the Application keeps the live copy). */
export interface BlacklistCampaignState {
  /** Ranks busted so far (drives the D2 pursuit ceiling and the next eligible rival). */
  readonly bustedRanks: readonly number[];
  /** Lifetime bounty — the career total that gates the next rival (D3). */
  readonly careerTotal: number;
}

/** The number of Blacklist ranks (15, rank 15 = first, rank 1 = the boss). */
export const BLACKLIST_RANKS = 15;

export function initialCampaignState(): BlacklistCampaignState {
  return { bustedRanks: [], careerTotal: 0 };
}

/**
 * The Blacklist roster (rank 15 → 1) with each rival's status: **busted** (you took their Pink
 * Slip), **unlocked** (challengeable — the career total meets the threshold), or **locked** (the
 * threshold isn't met yet). Pure — the Application's getter and the human simulation both use it.
 */
export function rosterEntries(
  state: BlacklistCampaignState,
  rivals: readonly BlacklistRivalConfig[],
): RosterEntry[] {
  return [...rivals]
    .sort((a, b) => b.rank - a.rank)
    .map((config) => ({
      config,
      status: state.bustedRanks.includes(config.rank)
        ? 'busted'
        : config.challengeThreshold <= state.careerTotal
          ? 'unlocked'
          : 'locked',
    }));
}

/** How many rivals are busted (D2: the pursuit ceiling is 1 + this, capped at the max heat). */
export function rivalsBustedCount(state: BlacklistCampaignState): number {
  return state.bustedRanks.length;
}

/**
 * The next rival to challenge (D3): the highest rank (15 → 1) whose career-bounty threshold is
 * met and that isn't already busted. Null when the career has run out of eligible rivals (all
 * busted, or the next one's threshold isn't met yet).
 */
export function nextEligibleRival(
  state: BlacklistCampaignState,
  rivals: readonly BlacklistRivalConfig[],
): BlacklistRivalConfig | null {
  let best: BlacklistRivalConfig | null = null;
  for (const rival of rivals) {
    if (rival.challengeThreshold > state.careerTotal) continue;
    if (state.bustedRanks.includes(rival.rank)) continue;
    if (best === null || rival.rank > best.rank) best = rival;
  }
  return best;
}

/** The win bounty, growing with the rival's rank (a tougher rival is worth more). */
export function raceWinReward(rank: number): number {
  return 8000 + (BLACKLIST_RANKS - rank + 1) * 1500;
}

/**
 * A race **win**: the rival is busted (raising the D2 ceiling by one) and the win bounty banks into
 * the career total (D3), which may unlock the next rival. Idempotent if the rank is already busted.
 */
export function applyRaceWin(
  state: BlacklistCampaignState,
  rank: number,
  reward: number = raceWinReward(rank),
): BlacklistCampaignState {
  const bustedRanks = state.bustedRanks.includes(rank)
    ? state.bustedRanks
    : [...state.bustedRanks, rank];
  return { bustedRanks, careerTotal: state.careerTotal + reward };
}
