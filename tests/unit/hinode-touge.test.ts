import { describe, expect, it } from 'vitest';

import { HINODE_TOUGE_START, ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { DEFAULT_SPAWN_ID, resolveSpawnPoint } from '../../src/config/spawns';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { sampleTerrainSurface } from '../../src/world/terrain-surface';

const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
const network = sampler.roadNetwork;
if (network === undefined) {
  throw new Error('The driving sampler must expose its carved road graph.');
}

const tougeEdges = network.edges.filter((edge) => edge.roadClass === 'touge');
console.info(
  'touge-profile',
  tougeEdges.map((edge) => [
    edge.id,
    Math.round(edge.lengthMeters),
    Math.round(edge.points[0]!.y),
    Math.round(edge.points.at(-1)!.y),
    Math.round(Math.max(...edge.points.map((point) => point.y))),
    Math.round(Math.min(...edge.points.map((point) => point.y))),
  ]),
);

describe('optional Hinode Touge route', () => {
  it('adds a connected, narrow switchback loop without changing the default start', () => {
    const start = resolveSpawnPoint('hinode-touge', 0);
    const surface = sampleTerrainSurface(sampler, start.x, start.z);
    const ruralHalfWidth = ROAD_NETWORK_CONFIG.halfWidthMeters;

    expect(start.id).toBe('hinode-touge');
    expect(start.x).toBe(HINODE_TOUGE_START.x);
    expect(surface.id).toBe('asphalt');
    expect(tougeEdges).toHaveLength(9);
    expect(tougeEdges.every((edge) => edge.halfWidthMeters < ruralHalfWidth)).toBe(true);
    expect(tougeEdges.every((edge) => edge.shoulderMeters === 1.2)).toBe(true);
    expect(network.neighboursOf(HINODE_TOUGE_START.id)).toContain('touge-north-1');
    expect(resolveSpawnPoint(undefined, 0).id).toBe(DEFAULT_SPAWN_ID);
  });

  it('climbs the volcano shoulder with multiple distinct changes of direction', () => {
    const profile = tougeEdges.flatMap((edge) => edge.points);
    const elevations = profile.map((point) => point.y);
    const elevationRange = Math.max(...elevations) - Math.min(...elevations);
    const length = tougeEdges.reduce((total, edge) => total + edge.lengthMeters, 0);
    const routeNodes = [
      HINODE_TOUGE_START,
      network.nodeById('touge-north-1')!,
      network.nodeById('touge-east-1')!,
      network.nodeById('touge-north-2')!,
      network.nodeById('touge-east-2')!,
      network.nodeById('touge-south-1')!,
      network.nodeById('touge-east-3')!,
      network.nodeById('touge-south-2')!,
      HINODE_TOUGE_START,
    ];
    const headings = routeNodes.slice(0, -1).map((from, index) => {
      const to = routeNodes[index + 1]!;
      return Math.atan2(-(to.x - from.x), -(to.z - from.z));
    });
    const sharpTurns = headings.filter((heading, index) => {
      const next = headings[(index + 1) % headings.length]!;
      const delta = Math.abs((((next - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      return delta > (Math.PI * 0.42);
    }).length;

    expect(length).toBeGreaterThan(1_600);
    expect(elevationRange).toBeGreaterThan(100);
    expect(sharpTurns).toBeGreaterThanOrEqual(5);
  });
});
