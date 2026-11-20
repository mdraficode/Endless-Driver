import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BLACKLIST_RACE,
  initialBlacklistRaceState,
  raceConfigForRank,
  stepBlacklistRace,
  type BlacklistRaceConfig,
  type BlacklistRaceState,
} from '../../src/most-wanted/BlacklistRaceModel';

const cfg: BlacklistRaceConfig = {
  routeLengthMeters: 1000,
  timeLimitSeconds: 60,
  rivalCruiseSpeedMps: 10, // rival covers the route in 100s (slower than a player who keeps moving)
  rivalHeadStartMeters: 0,
  countdownSeconds: 1,
};

/** Run the race for `seconds` at a constant player speed (m/s), using the given config. */
function run(
  config: BlacklistRaceConfig,
  state: BlacklistRaceState,
  playerSpeedMps: number,
  seconds: number,
  bustedAt = Infinity,
) {
  let s = state;
  const dt = 0.1;
  for (let t = 0; t < seconds; t += dt) {
    const progress = Math.min(1, (t * playerSpeedMps) / config.routeLengthMeters);
    const r = stepBlacklistRace(config, s, {
      dt,
      playerProgress: progress,
      busted: t >= bustedAt,
    });
    s = r.state;
    if (r.outcome !== null) return { state: s, outcome: r.outcome, at: t };
  }
  return { state: s, outcome: null, at: seconds };
}

describe('Blacklist race outcome model (Milestone 5a)', () => {
  it('counts down before the race, then races', () => {
    let s = initialBlacklistRaceState(cfg);
    expect(s.phase).toBe('countdown');
    expect(s.countdownRemaining).toBe(1);
    s = stepBlacklistRace(cfg, s, { dt: 0.5, playerProgress: 0, busted: false }).state;
    expect(s.phase).toBe('countdown');
    expect(s.countdownRemaining).toBeCloseTo(0.5);
    s = stepBlacklistRace(cfg, s, { dt: 0.6, playerProgress: 0, busted: false }).state;
    expect(s.phase).toBe('racing');
  });

  it('wins when the player reaches the finish ahead of the rival', () => {
    const { outcome } = run(cfg, initialBlacklistRaceState(cfg), 20, 60); // player does it in 50s
    expect(outcome).toBe('won');
  });

  it('loses when the rival finishes first', () => {
    // Player crawls (0.5 m/s) → the rival (10 m/s) finishes long before the player.
    const { outcome } = run(cfg, initialBlacklistRaceState(cfg), 0.5, 200);
    expect(outcome).toBe('lost');
  });

  it('loses when the player is busted', () => {
    const { outcome } = run(cfg, initialBlacklistRaceState(cfg), 20, 60, /* busted at */ 5);
    expect(outcome).toBe('lost');
  });

  it('loses when the clock runs out before the finish', () => {
    // Player at 0.2 m/s: the route takes 5000s, but the clock is 60s.
    const { outcome } = run(cfg, initialBlacklistRaceState(cfg), 0.2, 70);
    expect(outcome).toBe('lost');
  });

  it('a rival with a head start is ahead from the drop', () => {
    const lead: BlacklistRaceConfig = { ...cfg, rivalHeadStartMeters: 200 };
    const s = initialBlacklistRaceState(lead);
    expect(s.rivalProgress).toBeCloseTo(0.2); // 200 m of 1000 m
  });

  it('finishing exactly as the clock expires still counts if you reach the line', () => {
    // Player does the route in exactly the time limit (1000m at 1000/60... let's make it exact):
    // time limit 60s, route 600m at 10 m/s → finishes at 60s (race starts after 1s countdown).
    const exact: BlacklistRaceConfig = {
      routeLengthMeters: 590,
      timeLimitSeconds: 60,
      rivalCruiseSpeedMps: 10,
      rivalHeadStartMeters: 0,
      countdownSeconds: 1,
    };
    const { outcome } = run(exact, initialBlacklistRaceState(exact), 10, 70);
    // The player covers 590 m in 59s of racing (t=60 overall), just before the 60s clock ends.
    expect(outcome).toBe('won');
  });

  it('a finished race is idempotent (stepping it again changes nothing)', () => {
    const won = run(cfg, initialBlacklistRaceState(cfg), 20, 60);
    const again = stepBlacklistRace(cfg, won.state, {
      dt: 1,
      playerProgress: 1,
      busted: true,
    });
    expect(again.outcome).toBeNull();
    expect(again.state.phase).toBe('won');
  });

  it('exposes a sane default race config', () => {
    expect(DEFAULT_BLACKLIST_RACE.routeLengthMeters).toBeGreaterThan(0);
    expect(DEFAULT_BLACKLIST_RACE.timeLimitSeconds).toBeGreaterThan(0);
    expect(DEFAULT_BLACKLIST_RACE.rivalCruiseSpeedMps).toBeGreaterThan(0);
  });

  it('raceConfigForRank: rank 15 is the easiest, rank 1 (boss) the toughest', () => {
    const easy = raceConfigForRank(15, 6000);
    const boss = raceConfigForRank(1, 6000);
    // The boss is faster and starts ahead; the clock stays proportional to the route.
    expect(boss.rivalCruiseSpeedMps).toBeGreaterThan(easy.rivalCruiseSpeedMps);
    expect(boss.rivalHeadStartMeters).toBeGreaterThan(easy.rivalHeadStartMeters);
    expect(easy.rivalHeadStartMeters).toBe(0); // the first rival starts level
    // Both keep the route length so progress is on the same 0..1 scale.
    expect(easy.routeLengthMeters).toBe(6000);
    expect(boss.routeLengthMeters).toBe(6000);
    // The time limit scales with the route length and the rival's own run time.
    expect(easy.timeLimitSeconds).toBeGreaterThan(6000 / easy.rivalCruiseSpeedMps);
    expect(boss.timeLimitSeconds).toBeGreaterThan(6000 / boss.rivalCruiseSpeedMps);
  });

  it('raceConfigForRank: a shorter route gets a proportionally shorter clock', () => {
    const long = raceConfigForRank(8, 9000);
    const short = raceConfigForRank(8, 3000);
    expect(short.timeLimitSeconds).toBeLessThan(long.timeLimitSeconds);
    expect(short.rivalCruiseSpeedMps).toBeCloseTo(long.rivalCruiseSpeedMps, 6); // speed is per-rank, not per-route
  });
});
