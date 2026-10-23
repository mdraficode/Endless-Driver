import { describe, expect, it } from 'vitest';

import { HINODE_TOUGE_START, ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TRAIL_NETWORK_CONFIG } from '../../src/config/trails';
import { DEFAULT_SPAWN_ID, resolveSpawnPoint } from '../../src/config/spawns';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { createTerrainSampler } from '../../src/world/terrain-height';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';
import { sampleTerrainSurface } from '../../src/world/terrain-surface';
import { HinodeTougeWorld } from '../../src/world/hinode-touge';
import { trailAt, trailInfluenceAt } from '../../src/world/trails';

const sampler = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
const network = sampler.roadNetwork;
if (network === undefined) {
  throw new Error('The driving sampler must expose its carved road graph.');
}

const tougeEdges = network.edges.filter((edge) => edge.roadClass === 'touge');

describe('optional Hinode Touge route', () => {
  it('adds a connected, narrow switchback loop without changing the default start', () => {
    const start = resolveSpawnPoint('hinode-touge', 0);
    const surface = sampleTerrainSurface(sampler, start.x, start.z);
    const ruralHalfWidth = ROAD_NETWORK_CONFIG.halfWidthMeters;

    expect(start.id).toBe('hinode-touge');
    expect(start.x).toBe(HINODE_TOUGE_START.x);
    expect(surface.id).toBe('asphalt');
    expect(tougeEdges).toHaveLength(8);
    expect(tougeEdges.every((edge) => edge.halfWidthMeters < ruralHalfWidth)).toBe(true);
    expect(tougeEdges.every((edge) => edge.shoulderMeters === 1.2)).toBe(true);
    expect(tougeEdges.every((edge) => edge.maxGrade === 0.18)).toBe(true);
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
      const delta = Math.abs(((next - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      return delta > Math.PI * 0.42;
    }).length;

    expect(length).toBeGreaterThan(1_600);
    expect(elevationRange).toBeGreaterThan(100);
    expect(sharpTurns).toBeGreaterThanOrEqual(5);
  });

  it('adds ungraded packed-dirt ridge cuts between existing touge nodes', () => {
    const routes = TRAIL_NETWORK_CONFIG.routes.filter((route) => route.id.startsWith('hinode-'));
    const ridgeCut = routes.find((route) => route.id === 'hinode-ridge-cut');
    const screeRun = routes.find((route) => route.id === 'hinode-scree-run');

    expect(routes).toHaveLength(2);
    expect(ridgeCut?.points[0]).toEqual([-1230, -1540]);
    expect(ridgeCut?.points.at(-1)).toEqual([-1370, -1760]);
    expect(screeRun?.points[0]).toEqual([-1100, -1670]);
    expect(screeRun?.points.at(-1)).toEqual([-1410, -2010]);

    const sample = ridgeCut?.points[2];
    expect(sample).toBeDefined();
    expect(trailAt(sample![0], sample![1])?.routeId).toBe('hinode-ridge-cut');
    expect(trailInfluenceAt(sample![0], sample![1])).toBe(1);
    expect(sampleTerrainSurface(sampler, sample![0], sample![1]).gripModifier).toBeLessThan(1);
    const roadDistance = sampler.roadAt?.(sample![0], sample![1])?.distance ?? Infinity;
    expect(roadDistance).toBeGreaterThan(ROAD_NETWORK_CONFIG.blendWidthMeters);
    const naturalTerrain = createTerrainSampler(TERRAIN_CONFIG);
    expect(sampler.heightAt(sample![0], sample![1])).toBeCloseTo(
      naturalTerrain.heightAt(sample![0], sample![1]),
      6,
    );
  });

  it('places collidable guardrails and rockfall warnings off the main asphalt line', () => {
    const hazards = new HinodeTougeWorld(network, sampler);
    const stats = hazards.getContentStats();
    const edge = tougeEdges[2]!;
    const roadPoint = edge.points[Math.floor(edge.points.length / 2)]!;
    const roadDirection = edge.points[Math.floor(edge.points.length / 2) + 1]!;
    const yaw = Math.atan2(-(roadDirection.x - roadPoint.x), -(roadDirection.z - roadPoint.z));
    const centrelineHits = hazards.collide({
      x: roadPoint.x,
      z: roadPoint.z,
      yaw,
      velocityX: 0,
      velocityZ: 0,
    });

    expect(stats.hinodeTougeGuardrailSegments).toBeGreaterThan(10);
    expect(stats.hinodeTougeRockfallHazards).toBe(4);
    expect(stats.hinodeTougeWarningSigns).toBe(4);
    expect(centrelineHits).toHaveLength(0);

    const rock = hazards.rockfallPlacements[0]!;
    const rockContact = hazards.collide({
      x: rock.x,
      z: rock.z + 2,
      yaw: 0,
      velocityX: 0,
      velocityZ: -8,
    });
    expect(rockContact.length).toBeGreaterThan(0);
    expect(rockContact.some((hit) => hit.impact && hit.impactSpeed >= 1.35)).toBe(true);
  });
});
