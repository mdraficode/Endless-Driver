/** Sparse, clearly visible roadside rockfall hazards on the Hinode Touge loop. */
export interface TougeRockfallConfig {
  /** Stable road-network edge id, in the authored direction of travel. */
  readonly edgeId: string;
  /** Position along that edge, 0..1. */
  readonly progress: number;
  /** Signed side of the road centreline in the local tangent frame. */
  readonly side: -1 | 1;
  /** Approximate rock radius, metres. */
  readonly radius: number;
}

export const HINODE_TOUGE_ROCKFALLS: readonly TougeRockfallConfig[] = [
  {
    edgeId: 'touge-north-1->touge-east-1',
    progress: 0.48,
    side: 1,
    radius: 0.82,
  },
  {
    edgeId: 'touge-east-1->touge-north-2',
    progress: 0.44,
    side: -1,
    radius: 0.95,
  },
  {
    edgeId: 'touge-east-2->touge-south-1',
    progress: 0.56,
    side: 1,
    radius: 0.78,
  },
  {
    edgeId: 'touge-south-2->volcano-view',
    progress: 0.52,
    side: -1,
    radius: 0.88,
  },
];
