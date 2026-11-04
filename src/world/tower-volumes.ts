/**
 * Shared tower massing helpers (Phase 8.4c).
 *
 * A high-rise tower renders as a chain of stacked volumes: the main body plus either a single
 * set-back crown (monoliths) or a set-back tier stack (tiered towers). Both the night world and
 * the facade kit need the same decomposition, so it lives here.
 */

/** A tower's massing, structural so both the night specs and the facade-kit refs satisfy it. */
export interface TowerMassing {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly crown?: {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
    readonly offsetX?: number;
    readonly offsetZ?: number;
  };
  readonly tiers?: readonly {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
    readonly offsetX?: number;
    readonly offsetZ?: number;
  }[];
  readonly windowTopMeters?: number;
}

export interface TowerVolume {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  /** Volume base, metres from the ground. */
  readonly base: number;
  readonly height: number;
  readonly top: number;
}

/**
 * The tower's stacked render volumes, bottom to top: the main body, then the set-back crown
 * (monoliths) or the tier stack (tiered towers). The last volume's top is always the tower's
 * full height.
 */
export function towerVolumes(tower: TowerMassing): readonly TowerVolume[] {
  const bodyTop =
    tower.windowTopMeters ?? (tower.crown ? tower.height - tower.crown.height : tower.height);
  const volumes: TowerVolume[] = [
    {
      x: tower.x,
      z: tower.z,
      width: tower.width,
      depth: tower.depth,
      base: 0,
      height: bodyTop,
      top: bodyTop,
    },
  ];
  let y = bodyTop;
  if (tower.crown) {
    volumes.push({
      x: tower.x + (tower.crown.offsetX ?? 0),
      z: tower.z + (tower.crown.offsetZ ?? 0),
      width: tower.crown.width,
      depth: tower.crown.depth,
      base: y,
      height: tower.height - y,
      top: tower.height,
    });
    return volumes;
  }
  for (const tier of tower.tiers ?? []) {
    volumes.push({
      x: tower.x + (tier.offsetX ?? 0),
      z: tower.z + (tier.offsetZ ?? 0),
      width: tier.width,
      depth: tier.depth,
      base: y,
      height: tier.height,
      top: y + tier.height,
    });
    y += tier.height;
  }
  return volumes;
}

/** The tower's topmost render volume (facade band, mast and night accent target). */
export function topTowerVolume(tower: TowerMassing): TowerVolume {
  const volumes = towerVolumes(tower);
  return volumes[volumes.length - 1]!;
}
