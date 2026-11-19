import { describe, expect, it } from 'vitest';

import { BOUNTY_CONFIG, BUST_CONFIG } from '../../src/config/most-wanted';
import { initialBountyState, settleBounty, stepBounty } from '../../src/most-wanted/BountyModel';

describe('Most Wanted bounty + busted resolution (Phase 10, Milestone 4a)', () => {
  it('accrues a per-second bounty while actively being chased', () => {
    const r = stepBounty(initialBountyState(), {
      inPursuit: true,
      level: 3,
      dt: 10,
      disabledUnit: null,
    });
    expect(r.state.currentPursuit).toBeCloseTo(BOUNTY_CONFIG.pursuitRatePerSecond * 10);
    expect(r.state.careerTotal).toBe(0);
  });

  it('does not accrue when there is no active pursuit', () => {
    const r = stepBounty(initialBountyState(), {
      inPursuit: false,
      level: 3,
      dt: 10,
      disabledUnit: null,
    });
    expect(r.state.currentPursuit).toBe(0);
  });

  it('adds a disabled unit to the pursuit bounty at its per-class value', () => {
    const r = stepBounty(initialBountyState(), {
      inPursuit: true,
      level: 4,
      dt: 0,
      disabledUnit: 'rhino',
    });
    expect(r.bustedUnit).toEqual({ kind: 'rhino', bounty: BOUNTY_CONFIG.unitBounty.rhino });
    expect(r.state.currentPursuit).toBe(BOUNTY_CONFIG.unitBounty.rhino);
  });

  it('evading KEEPS the bounty into the career total (D3)', () => {
    const state = { currentPursuit: 7500, careerTotal: 1000 };
    const r = settleBounty(state, 'evaded', 3, 0);
    expect(r.outcome).toBe('evaded');
    expect(r.bountyKept).toBe(7500);
    expect(r.careerTotal).toBe(8500);
    expect(r.fine).toBe(0);
    expect(r.state).toEqual({ currentPursuit: 0, careerTotal: 8500 });
  });

  it('a bust forfeits the bounty, pays a fine, and takes an impound strike (D4)', () => {
    const state = { currentPursuit: 9000, careerTotal: 1000 };
    const r = settleBounty(state, 'busted', 5, 0);
    expect(r.outcome).toBe('busted');
    // fine = base + per-level * level
    expect(r.fine).toBe(BUST_CONFIG.baseFine + BUST_CONFIG.finePerLevel * 5);
    expect(r.bountyKept).toBe(0);
    expect(r.bountyLost).toBe(9000);
    expect(r.impoundStrikes).toBe(1);
    // career total is NOT increased (bounty lost)
    expect(r.careerTotal).toBe(1000);
    expect(r.carRemoved).toBe(false);
    expect(r.state).toEqual({ currentPursuit: 0, careerTotal: 1000 });
    expect(r.resolution).toEqual({ fine: r.fine, impoundStrikes: 1, carRemoved: false });
  });

  it('a bust at the impound-strike cap adds the impound fine, still never removes the car', () => {
    const r = settleBounty(
      { currentPursuit: 100, careerTotal: 0 },
      'busted',
      1,
      BUST_CONFIG.impoundStrikesMax - 1, // already at cap-1 → this is the cap strike
    );
    expect(r.impoundStrikes).toBe(BUST_CONFIG.impoundStrikesMax);
    expect(r.fine).toBe(
      BUST_CONFIG.baseFine + BUST_CONFIG.finePerLevel * 1 + BUST_CONFIG.impoundFine,
    );
    expect(r.carRemoved).toBe(false);
  });

  it('a clean bust with no accrued bounty still pays the base fine', () => {
    const r = settleBounty(initialBountyState(), 'busted', 1, 0);
    expect(r.fine).toBe(BUST_CONFIG.baseFine + BUST_CONFIG.finePerLevel * 1);
    expect(r.bountyLost).toBe(0);
    expect(r.carRemoved).toBe(false);
  });
});
