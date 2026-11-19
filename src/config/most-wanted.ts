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

/** Heat ramp + cool-down tuning (crime accrual, cool-down, per-pursuit ceiling). */
export const HEAT_CONFIG = {
  /** Crime added per second of speeding above the threshold. */
  speedCrimePerSecond: 0.05,
  /** Speed (m/s) above which speeding accrues heat. */
  speedCrimeThresholdMps: 34,
  /** Crime from a collision with a unit. */
  collisionCrime: 0.12,
  /** Crime from ramming a unit harder. */
  ramCrime: 0.2,
  /** Heat level decay per second of clean driving. */
  coolDownLevelPerSecond: 0.06,
  /** Below this level the cool-down is faster (early heat falls off quickly). */
  coolDownFastBelowLevel: 3,
  coolDownFastMultiplier: 2.0,
  /** D2: a pursuit's ceiling = ceilingBase + rivals busted, capped at HEAT_LEVELS. */
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
  readonly units: readonly PoliceUnitKind[];
  readonly tactics: readonly PoliceTactic[];
  /** The heavy/boss unit for this level (NFS MW's per-tier "boss"). */
  readonly boss: PoliceUnitKind;
}

/** Build the police mix for a heat level (clamped to 1..HEAT_LEVELS). */
export function policeMixForLevel(level: number): PoliceMix {
  const n = Math.max(1, Math.min(HEAT_LEVELS, Math.round(level)));
  const units: PoliceUnitKind[] = ['sedan'];
  const tactics: PoliceTactic[] = ['pursuit'];
  let boss: PoliceUnitKind = 'sedan';
  const add = (kind: PoliceUnitKind): void => {
    if (!units.includes(kind)) units.push(kind);
  };
  if (n >= 2) {
    add('unmarked');
    tactics.push('ram', 'roadblock');
  }
  if (n >= 3) {
    add('suv');
    tactics.push('pit');
    boss = 'rhino';
  }
  if (n >= 4) {
    add('muscle');
    tactics.push('spike', 'lock');
    boss = 'muscle';
  }
  if (n >= 5) {
    add('heli');
    add('cross');
    tactics.push('searchlight', 'cross');
    boss = 'cross';
  }
  if (n >= 6) {
    add('van');
    if (!tactics.includes('roadblock')) tactics.push('roadblock');
  }
  if (n >= 8) add('van');
  if (n >= 10) add('motorcycle');
  if (n >= 11) add('rhino');
  if (n >= 13) add('muscle');
  return { units, tactics, boss };
}

/** Base pursuit behaviour (spawning, reinforcement). */
export const POLICE_CONFIG = {
  baseSpawnRadiusMeters: 60,
  maxSpawnDistanceMeters: 240,
  spawnIntervalSeconds: 2.5,
  /** Below this many units, reinforcements kick in (NFS MW backup scaling). */
  reinforceMinUnits: 2,
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
  tierCaps: MW_TIER_CAPS,
  bossHeatMaxUnitsA: MW_BOSS_HEAT_MAX_UNITS_A,
  placement: MW_PLACEMENT,
  rivals: BLACKLIST_RIVALS,
} as const;
