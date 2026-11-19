/**
 * Phase 10 Most Wanted — all the tuning for the police-chase + Blacklist system.
 *
 * Every number the gameplay reads lives here, so a later milestone (the `MostWantedSystem`
 * implementation) stays logic-only. The value tables encode the locked design decisions:
 * 1–15 heat levels (D2), career-total bounty gating rivals (D3), fine + repair only on 3
 * impound strikes (D4), hide spots with limited uses per pursuit (D5), and free-form
 * hunt-and-destroy bust races (D6).
 */
import type { TierId } from './tiers';
import type {
  BlacklistRivalConfig,
  MwPlacementConfig,
  PoliceTactic,
  PoliceUnitKind,
} from '../most-wanted/types';

/** The number of heat levels (D2: NFS MW's full 1–15 range). */
export const HEAT_LEVELS = 15;

/** The localStorage key for the persisted Most Wanted career. */
export const MOST_WANTED_STORAGE_KEY = 'endless-driver:most-wanted:v1';

/** The quality tier also selects the police intensity (how hard the heat plays). */
export type PoliceIntensity = TierId;

/**
 * Heat (wanted) tuning. Faithful to NFS Most Wanted (2005): the 0..1 meter fills while you
 * are being chased — faster at higher heat, and it stalls at high heat unless you keep
 * committing infractions (level 1 climbs from being chased alone). A crime while clean pulls
 * a 911. Once you lose the police you cool down: the level decays, faster at low heat and
 * much faster when stopped. The ceiling is gated by Blacklist progress (D2).
 */
export const HEAT_CONFIG = {
  /** Speed (m/s) above which the player is "speeding" (a continuous crime). */
  speedCrimeThresholdMps: 34,
  /** The 0..1 meter fills at this rate/sec at level 1 (about 15 s to a level-up). */
  baseFillRate: 0.067,
  /** Each heat level fills this fraction faster (the higher the heat, the faster it climbs). */
  perLevelFillBoost: 0.25,
  /** Fill activity when committing no crime at the top heat (the rise stalls without infractions). */
  cleanFloorActivity: 0.35,
  /** How fast the clean-activity floor drops per level (level 1 still rises from being chased). */
  perLevelActivityDecay: 0.07,
  /** A ram/collision keeps fill activity at 1.0 for this many seconds. */
  recentCrimeWindowSeconds: 2.0,
  /** Discrete heat added by ramming a police unit. */
  ramCrimeHeat: 0.25,
  /** Discrete heat added by a (non-police) collision. */
  collisionCrimeHeat: 0.12,
  /** Cooldown: heat drained per second (the level falls as this crosses below 0). */
  coolDownFillPerSecond: 0.06,
  /** Below this level, cooldown is faster. */
  coolDownFastBelowLevel: 3,
  coolDownFastMultiplier: 2.0,
  /** Stopped / engine off drains cooldown much faster (a known MW tip). */
  stationaryCoolDownMultiplier: 2.5,
  /** D2: pursuit ceiling = ceilingBase + rivals busted, capped at HEAT_LEVELS. */
  ceilingBase: 1,
} as const;

/** Bounty tuning: per-unit payouts and the pursuit accrual rate. */
export const BOUNTY_CONFIG = {
  /** Bounty accrued per second of an active pursuit. */
  pursuitRatePerSecond: 10,
  /** Bounty per busted unit, by class (NFS MW's escalating values). */
  unitBounty: {
    sedan: 250,
    unmarked: 500,
    motorcycle: 500,
    van: 500,
    muscle: 1000,
    suv: 1000,
    rhino: 10000,
    heli: 5000,
    cross: 100000,
  } as const satisfies Record<PoliceUnitKind, number>,
  /**
   * D3: the career-total bounty required to challenge the Nth rival (index 0 = first).
   * Fifteen thresholds, one per Blacklist rival.
   */
  challengeThresholds: [
    0, 5000, 20000, 60000, 150000, 350000, 700000, 1300000, 2200000, 3500000, 5200000, 7500000,
    10500000, 14500000, 20000000,
  ] as const,
} as const;

/** Bust tuning: the surround-and-stop that ends a pursuit, and the fine/impound rules. */
export const BUST_CONFIG = {
  /** The player must drop below this speed (m/s) to be caught. */
  maxSpeedMps: 6,
  /** The surround radius (m) within which units must hold the player. */
  radiusMeters: 12,
  /** Bust-meter fill rate while the player is boxed in. */
  fillPerSecond: 0.35,
  /** Bust-meter drain rate once the player breaks free. */
  drainPerSecond: 0.5,
  /** Base fine (before the per-level adder). */
  baseFine: 2000,
  /** Fine added per heat level at the bust. */
  finePerLevel: 1500,
  /** D4: strikes at which the penalty becomes fine + repair only (car is never removed). */
  impoundStrikesMax: 3,
  impoundFine: 20000,
} as const;

/** Evade tuning: pursuit-breakers, hide spots, and losing sight of the cops. */
export const EVADE_CONFIG = {
  /** A unit within this radius (m) is "seeing" the player. */
  detectRadiusMeters: 90,
  /** Seconds the player must stay unseen before the pursuit breaks (lose-sight). */
  lostHoldSeconds: 3,
  /** Seconds the player must remain in a hide spot to break the pursuit. */
  hideHoldSeconds: 3,
  /** D5: hide spots have this many uses per pursuit (anti-camping). */
  hideUsesPerPursuit: 2,
  /**
   * A player within this radius of a world hideout is "hidden" from the police. Hideouts sit
   * ~65 m off the road centrelines, so 80 m is the nearest-road reach: driving to a hideout's
   * access makes the squad lose visual lock.
   */
  hideSpotRadiusMeters: 80,
  /** D5: pursuit-breaker uses per pursuit. */
  breakerUsesPerPursuit: 2,
  /** How many pursuing units a pursuit-breaker sheds. */
  breakerShedCount: 3,
} as const;

/** Per-class police unit stats (mass, top speed, damage resistance, and whether it is air). */
export const POLICE_UNITS = {
  sedan: { massKg: 1400, topSpeedMps: 38, damageResist: 0.5, air: false },
  unmarked: { massKg: 1500, topSpeedMps: 40, damageResist: 0.55, air: false },
  motorcycle: { massKg: 300, topSpeedMps: 44, damageResist: 0.2, air: false },
  van: { massKg: 2500, topSpeedMps: 30, damageResist: 0.7, air: false },
  muscle: { massKg: 1800, topSpeedMps: 46, damageResist: 0.6, air: false },
  suv: { massKg: 2600, topSpeedMps: 34, damageResist: 0.75, air: false },
  rhino: { massKg: 8000, topSpeedMps: 30, damageResist: 1.0, air: false },
  heli: { massKg: 0, topSpeedMps: 36, damageResist: 0.8, air: true },
  cross: { massKg: 3200, topSpeedMps: 42, damageResist: 0.85, air: false },
} as const satisfies Record<
  PoliceUnitKind,
  { massKg: number; topSpeedMps: number; damageResist: number; air: boolean }
>;

/** The unit roster, tactics and boss for a given heat level (NFS MW's escalation). */
export interface PoliceMix {
  /** Target count of each unit kind at this level (absent kinds are 0). */
  readonly counts: Readonly<Record<PoliceUnitKind, number>>;
  /** The set of unit kinds present at this level (convenience). */
  readonly units: readonly PoliceUnitKind[];
  readonly tactics: readonly PoliceTactic[];
  /** The heavy/boss unit for this level (NFS MW's per-tier "boss"). */
  readonly boss: PoliceUnitKind;
  /** Total ground units targeted (excludes the helicopter, which is capped separately). */
  readonly totalUnits: number;
  /** Whether roadblocks are deployed at this level (L2+). */
  readonly roadblocks: boolean;
  /** Whether spike strips are deployed at this level (L4+). */
  readonly spikeStrips: boolean;
  /** Whether a police helicopter is on station at this level (L4+). */
  readonly helicopter: boolean;
}

const ZERO_COUNTS: Record<PoliceUnitKind, number> = {
  sedan: 0,
  unmarked: 0,
  motorcycle: 0,
  van: 0,
  muscle: 0,
  suv: 0,
  rhino: 0,
  heli: 0,
  cross: 0,
};

function buildMix(
  partial: Partial<Record<PoliceUnitKind, number>>,
  tactics: PoliceTactic[],
  boss: PoliceUnitKind,
  flags: { roadblocks?: boolean; spikeStrips?: boolean; helicopter?: boolean },
): PoliceMix {
  const counts = { ...ZERO_COUNTS, ...partial };
  const units = (Object.keys(counts) as PoliceUnitKind[]).filter((kind) => counts[kind] > 0);
  const totalUnits = units
    .filter((kind) => kind !== 'heli')
    .reduce((sum, kind) => sum + counts[kind], 0);
  return {
    counts,
    units,
    tactics,
    boss,
    totalUnits,
    roadblocks: !!flags.roadblocks,
    spikeStrips: !!flags.spikeStrips,
    helicopter: !!flags.helicopter,
  };
}

/**
 * The per-level escalation (NFS MW 2005). Six profiles — the real game caps at 6 (7 in the
 * Black Edition) — levels 7..15 reuse the level-6 profile so our 1–15 scale plateaus at "max".
 *   L1 district cruisers · L2 + unmarked + roadblocks · L3 + state cruisers + Light Rhino + P.I.T.
 *   L4 + Heavy Rhino + spike strips + helicopter · L5 + Corvette/Cross + full escalation
 *   L6 Cross's Street Racing Unit leads.
 */
const LEVEL_PROFILES: Record<number, PoliceMix> = {
  1: buildMix({ sedan: 3 }, ['pursuit'], 'sedan', {}),
  2: buildMix({ sedan: 2, unmarked: 3 }, ['pursuit', 'ram', 'roadblock'], 'unmarked', {
    roadblocks: true,
  }),
  3: buildMix(
    { sedan: 1, unmarked: 2, muscle: 2, rhino: 1 },
    ['pursuit', 'ram', 'roadblock', 'pit', 'rhino'],
    'rhino',
    { roadblocks: true },
  ),
  4: buildMix(
    { unmarked: 3, muscle: 2, rhino: 1, heli: 1 },
    ['pursuit', 'ram', 'roadblock', 'pit', 'spike', 'searchlight'],
    'rhino',
    { roadblocks: true, spikeStrips: true, helicopter: true },
  ),
  5: buildMix(
    { unmarked: 2, muscle: 3, rhino: 2, heli: 1, cross: 1 },
    ['pursuit', 'ram', 'roadblock', 'pit', 'spike', 'searchlight', 'cross'],
    'cross',
    { roadblocks: true, spikeStrips: true, helicopter: true },
  ),
  6: buildMix(
    { muscle: 3, rhino: 2, heli: 1, cross: 2 },
    ['pursuit', 'ram', 'roadblock', 'pit', 'spike', 'searchlight', 'cross', 'lock'],
    'cross',
    { roadblocks: true, spikeStrips: true, helicopter: true },
  ),
};

/** Build the police mix for a heat level (1..6; 7+ reuse the level-6 "max" profile). */
export function policeMixForLevel(level: number): PoliceMix {
  const n = Math.max(1, Math.min(6, Math.round(level)));
  return LEVEL_PROFILES[n]!;
}

/** Base pursuit behaviour (spawning, reinforcement). */
export const POLICE_CONFIG = {
  baseSpawnRadiusMeters: 60,
  maxSpawnDistanceMeters: 240,
  spawnIntervalSeconds: 2.5,
  /** Below this many units, reinforcements kick in (NFS MW backup scaling). */
  reinforceMinUnits: 2,
} as const;

/**
 * Pursuit-brain timing (the decision layer; the unit-spawning/steering layer reads these too).
 * Faithful feel, tuned for playability: the roster ramps up gradually, backup is called when you
 * nearly escape, and roadblocks / spike strips re-deploy on a cadence.
 */
export const PURSUIT_CONFIG = {
  /** Seconds between individual unit spawns (so the roster ramps up rather than appearing at once). */
  spawnIntervalSeconds: 1.2,
  /** Max units spawned in a single tick. */
  spawnPerTick: 1,
  /** Below this many active units (and still being chased), backup is called. */
  reinforceMinUnits: 2,
  /** How often (s) a roadblock can be (re)deployed ahead of the player. */
  roadblockIntervalSeconds: 9,
  /** How often (s) a spike strip can be (re)deployed. */
  spikeIntervalSeconds: 12,
} as const;

/**
 * Tactical geometry (Milestone 3b): where each unit aims and where roadblocks / spike strips /
 * the heli go, in metres along the road ahead of the player. Feeds the pure `PursuitTactics`
 * layer that turns the pursuit roster into concrete per-unit targets.
 */
export const PURSUIT_TACTICS = {
  /** A rhino aims this far ahead of the player (head-on ram). */
  ramLeadMeters: 12,
  /** A P.I.T. unit shunts this far behind the player's rear. */
  pitGapMeters: 4,
  /** Box-in units flank this far to the side of the player. */
  boxOffsetMeters: 3,
  /** Roadblock distance ahead of the player (placed across the road). */
  roadblockDistMeters: 40,
  /** Spike strip placed this far beyond the roadblock. */
  spikeGapMeters: 15,
  /** Heli hovers this far ahead of the player. */
  heliForwardMeters: 30,
  /** Heli hover height above the player. */
  heliHeightMeters: 40,
  /** A unit within this radius counts toward "boxed in". */
  boxRadiusMeters: 15,
} as const;

/** The per-tier cap on how much heat the police can field (C < B < A). */
export interface MwTierCap {
  readonly maxUnits: number;
  readonly reinforceCadenceSeconds: number;
  readonly maxHelicopters: number;
  readonly reinforce: boolean;
  readonly effects: boolean;
  readonly maxRadioVoices: number;
  readonly tactics: readonly PoliceTactic[];
}

export const MW_TIER_CAPS: Readonly<Record<TierId, MwTierCap>> = {
  C: {
    maxUnits: 4,
    reinforceCadenceSeconds: 3,
    maxHelicopters: 0,
    reinforce: false,
    effects: false,
    maxRadioVoices: 1,
    tactics: ['pursuit', 'ram', 'roadblock'],
  },
  B: {
    maxUnits: 8,
    reinforceCadenceSeconds: 2,
    maxHelicopters: 1,
    reinforce: true,
    effects: true,
    maxRadioVoices: 3,
    tactics: ['pursuit', 'ram', 'roadblock', 'pit', 'spike', 'lock'],
  },
  A: {
    maxUnits: 12,
    reinforceCadenceSeconds: 1,
    maxHelicopters: 2,
    reinforce: true,
    effects: true,
    maxRadioVoices: 5,
    tactics: [
      'pursuit',
      'ram',
      'roadblock',
      'pit',
      'spike',
      'lock',
      'rhino',
      'searchlight',
      'cross',
    ],
  },
};

/** The A-tier cap on units during a boss (Blacklist) heat spike. */
export const MW_BOSS_HEAT_MAX_UNITS_A = 15;

/** Seeded per-region placement of hideouts, pursuit-breakers, bounties and police anchors. */
export const MW_PLACEMENT: MwPlacementConfig = {
  radiusFactor: 0.55,
  minEdgeLengthMeters: 40,
  eligibleClasses: ['urban-arterial', 'urban-local', 'city-access'],
  hideSpots: [1, 2],
  pursuitBreakers: [1, 2],
  bountySpots: [1, 3],
  policeAnchors: [2, 4],
};

/**
 * The fifteen Blacklist rivals, rank 15 (first to challenge) down to rank 1 (the boss).
 * Names are provisional — to be finalized with the owner. `carId`/`pinkSlipCar` are the
 * vehicle ids this milestone reserves.
 */
const RIVAL_NAMES = [
  'Kaito',
  'Momo',
  'Riku',
  'Sora',
  'Hana',
  'Tetsu',
  'Yui',
  'Kenji',
  'Akira',
  'Rei',
  'Daisuke',
  'Shogo',
  'Hiro',
  'Kazuya',
  'Oni',
] as const;

export const BLACKLIST_RIVALS: readonly BlacklistRivalConfig[] = RIVAL_NAMES.map((name, index) => {
  const rank = HEAT_LEVELS - index;
  const nn = String(rank).padStart(2, '0');
  return {
    rank,
    name,
    carId: `mw-rival-${nn}`,
    pinkSlipCar: `mw-car-${nn}`,
    challengeThreshold: BOUNTY_CONFIG.challengeThresholds[index]!,
  };
});

/** The single aggregate Most Wanted config object (convenience for the system). */
export const MOST_WANTED_CONFIG = {
  heatLevels: HEAT_LEVELS,
  storageKey: MOST_WANTED_STORAGE_KEY,
  heat: HEAT_CONFIG,
  bounty: BOUNTY_CONFIG,
  bust: BUST_CONFIG,
  evade: EVADE_CONFIG,
  policeUnits: POLICE_UNITS,
  police: POLICE_CONFIG,
  pursuit: PURSUIT_CONFIG,
  pursuitTactics: PURSUIT_TACTICS,
  tierCaps: MW_TIER_CAPS,
  bossHeatMaxUnitsA: MW_BOSS_HEAT_MAX_UNITS_A,
  placement: MW_PLACEMENT,
  rivals: BLACKLIST_RIVALS,
} as const;
