import { Mesh } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';

import { resolveUrbanWetness, URBAN_CITY_CONFIG } from '../../src/config/urban-city';
import { ROAD_NETWORK_CONFIG } from '../../src/config/roads';
import { TERRAIN_CONFIG } from '../../src/config/terrain';
import { AOHARA_DISTRICT_CONFIG } from '../../src/config/urban-district';
import { EnvironmentClock } from '../../src/environment/EnvironmentClock';
import { roadInfluence } from '../../src/world/road-network';
import { createTerrainSampler } from '../../src/world/terrain-height';
import { sampleTerrainSurface } from '../../src/world/terrain-surface';
import { RoadWorld } from '../../src/world/RoadWorld';
import {
  ROAD_MARKING_JUNCTION_CLEARANCE_METERS,
  trimRoadEdge,
} from '../../src/world/road-geometry';
import { createWorldTerrainSampler } from '../../src/world/world-terrain';

/**
 * Phase 4 Increment 2 — the spline road network pinned against its contract:
 * one deterministic solved profile feeds the terrain carve, the physics sampler, and the
 * surface query, so the three can never disagree about where the road is or how it lies.
 */

const base = createTerrainSampler(TERRAIN_CONFIG);
const world = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG);
const network =
  world.roadNetwork ??
  (() => {
    throw new Error('world sampler must expose the road network used by terrain and physics');
  })();

function centreOf(edgeId: string): { x: number; z: number; y: number } {
  const edge = network.edges.find((candidate) => candidate.id === edgeId);
  if (edge === undefined) {
    throw new Error(`missing edge ${edgeId}`);
  }
  const point = edge.points[Math.floor(edge.points.length / 2)] as (typeof edge.points)[number];
  return point;
}

describe('road network graph', () => {
  it('connects every node into one graph reachable from the spawn junction', () => {
    const visited = new Set<string>(['spawn-junction']);
    const queue = ['spawn-junction'];
    while (queue.length > 0) {
      const nodeId = queue.shift() as string;
      for (const next of network.neighboursOf(nodeId)) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    expect(visited.size).toBe(ROAD_NETWORK_CONFIG.nodes.length);
    expect(network.edges.length).toBe(ROAD_NETWORK_CONFIG.edges.length);
    for (const edge of network.edges) {
      expect(edge.lengthMeters).toBeGreaterThan(50);
      expect(edge.points.length).toBeGreaterThan(10);
    }
  });

  it('is deterministic: rebuilding yields the identical profile', () => {
    const again = createWorldTerrainSampler(TERRAIN_CONFIG, ROAD_NETWORK_CONFIG).roadNetwork;
    if (again === undefined) {
      throw new Error('rebuilt world sampler must expose its road network');
    }
    expect(again.edges[0]?.points).toEqual(network.edges[0]?.points);
    expect([...again.nodes.values()]).toEqual([...network.nodes.values()]);
  });

  it('keeps the network grade cap except for the authored mountain route', () => {
    for (const edge of network.edges) {
      expect(edge.maxGrade).toBe(edge.roadClass === 'touge' ? 0.18 : ROAD_NETWORK_CONFIG.maxGrade);
    }
  });

  it('builds the connected 5×5 Aohara grid with arterial spines and a rural gateway', () => {
    const urbanNodes = [...network.nodes.values()].filter((node) => node.id.startsWith('aohara-'));
    const urbanEdges = network.edges.filter(
      (edge) => edge.roadClass === 'urban-local' || edge.roadClass === 'urban-arterial',
    );
    const arterialEdges = urbanEdges.filter((edge) => edge.roadClass === 'urban-arterial');
    const localEdges = urbanEdges.filter((edge) => edge.roadClass === 'urban-local');
    const westGateway = network.nodeById('aohara-middle-west-outer');
    const access = network.edges.find((edge) => edge.roadClass === 'city-access');

    expect(urbanNodes).toHaveLength(25);
    expect(urbanEdges).toHaveLength(40);
    expect(arterialEdges).toHaveLength(8);
    expect(localEdges).toHaveLength(32);
    expect(westGateway).toMatchObject({
      x: AOHARA_DISTRICT_CONFIG.centerX - 2 * AOHARA_DISTRICT_CONFIG.gridSpacingMeters,
      z: AOHARA_DISTRICT_CONFIG.centerZ,
    });
    expect(access?.from).toBe('east-plain');
    expect(access?.to).toBe('aohara-middle-west-outer');
  });

  it('carries Aohara road classes and widths into visual and physics samples', () => {
    const center = world.roadAt?.(AOHARA_DISTRICT_CONFIG.centerX, AOHARA_DISTRICT_CONFIG.centerZ);
    expect(center?.roadClass).toBe('urban-arterial');
    expect(center?.halfWidthMeters).toBe(AOHARA_DISTRICT_CONFIG.arterialHalfWidthMeters);
    expect(
      sampleTerrainSurface(
        world,
        AOHARA_DISTRICT_CONFIG.centerX + 9,
        AOHARA_DISTRICT_CONFIG.centerZ + 40,
      ).id,
    ).toBe('asphalt');
    expect(
      sampleTerrainSurface(
        world,
        AOHARA_DISTRICT_CONFIG.centerX + 11,
        AOHARA_DISTRICT_CONFIG.centerZ + 40,
      ).id,
    ).toBe('gravel');
    const local = world.roadAt?.(
      AOHARA_DISTRICT_CONFIG.centerX - AOHARA_DISTRICT_CONFIG.gridSpacingMeters / 2,
      AOHARA_DISTRICT_CONFIG.centerZ - AOHARA_DISTRICT_CONFIG.gridSpacingMeters,
    );
    expect(local?.roadClass).toBe('urban-local');
    expect(local?.halfWidthMeters).toBe(AOHARA_DISTRICT_CONFIG.localStreetHalfWidthMeters);
  });

  it('batches roads, city sidewalks and crossings into a bounded mesh set', () => {
    const roads = new RoadWorld(network);
    const stats = roads.getStats();
    expect(stats.roadMeshes).toBeLessThanOrEqual(8);
    expect(stats.urbanSidewalkEdges).toBe(40);
    expect(stats.urbanCrosswalkIntersections).toBe(25);
    expect(roads.object.getObjectByName('aohara-sidewalks')).not.toBeNull();
    expect(roads.object.getObjectByName('aohara-crosswalks-and-stop-lines')).not.toBeNull();
    const urbanAsphalt = roads.object.getObjectByName('road-urban-asphalt');
    expect(urbanAsphalt).toBeInstanceOf(Mesh);
    if (!(urbanAsphalt instanceof Mesh)) {
      throw new Error('Aohara road batch should exist');
    }
    expect(urbanAsphalt.material).toBeInstanceOf(MeshPhysicalNodeMaterial);
    const asphaltMaterial = urbanAsphalt.material as MeshPhysicalNodeMaterial;
    expect(asphaltMaterial.clearcoatNode).not.toBeNull();
    expect(asphaltMaterial.clearcoatRoughnessNode).not.toBeNull();
    expect(roads.getStats().urbanWetLook).toBe(URBAN_CITY_CONFIG.wetRoad.wetnessDay);
    roads.setSurfaceWetness(0.85);
    expect(roads.getStats().urbanWetLook).toBe(0.85);
    const daylight = new EnvironmentClock({ startHour: 23.5 }).daylight();
    roads.setDaylight(daylight);
    expect(roads.getStats().urbanWetLook).toBeCloseTo(
      Math.max(resolveUrbanWetness(daylight.sunElevationDegrees), 0.85),
    );
    roads.setSurfaceWetness(0);
    expect(roads.getStats().urbanWetLook).toBeCloseTo(
      resolveUrbanWetness(daylight.sunElevationDegrees),
    );
    roads.setSurfaceWetness(Number.NaN);
    expect(roads.getStats().urbanWetLook).toBeCloseTo(
      resolveUrbanWetness(daylight.sunElevationDegrees),
    );
    roads.dispose();
  });

  it('trims road-edge paint and dashes back from junctions instead of crossing the roadway', () => {
    const roads = new RoadWorld(network);
    const minimumClearance = ROAD_MARKING_JUNCTION_CLEARANCE_METERS - 0.1;
    for (const name of ['road-edge-markings', 'road-lane-dashes', 'road-urban-centerlines']) {
      const marking = roads.object.getObjectByName(name);
      expect(marking).toBeInstanceOf(Mesh);
      if (!(marking instanceof Mesh)) {
        throw new Error(`missing road marking batch: ${name}`);
      }
      const positions = marking.geometry.getAttribute('position');
      let closestNode = '';
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const node of network.nodes) {
        for (let index = 0; index < positions.count; index += 1) {
          const dx = positions.getX(index) - node.x;
          const dz = positions.getZ(index) - node.z;
          const distance = Math.hypot(dx, dz);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestNode = node.id;
          }
        }
      }
      expect(closestDistance, `${name} nearest to ${closestNode}`).toBeGreaterThanOrEqual(
        minimumClearance,
      );
    }
    for (const edge of network.edges) {
      const clipped = trimRoadEdge(
        edge,
        ROAD_MARKING_JUNCTION_CLEARANCE_METERS,
        ROAD_MARKING_JUNCTION_CLEARANCE_METERS,
      );
      expect(clipped).not.toBeNull();
      if (clipped === null) {
        throw new Error(`expected a clipped profile for ${edge.id}`);
      }
      expect(clipped.points[0]?.alongMeters).toBe(ROAD_MARKING_JUNCTION_CLEARANCE_METERS);
      expect(clipped.points.at(-1)?.alongMeters).toBeCloseTo(
        edge.lengthMeters - ROAD_MARKING_JUNCTION_CLEARANCE_METERS,
        6,
      );
    }
    roads.dispose();
  });

  it('pins every junction: edges meeting at a node share its elevation exactly', () => {
    for (const edge of network.edges) {
      const from = network.nodeById(edge.from);
      const to = network.nodeById(edge.to);
      const first = edge.points[0];
      const last = edge.points[edge.points.length - 1];
      if (from === null || to === null || first === undefined || last === undefined) {
        throw new Error('incomplete network');
      }
      expect(first.y).toBeCloseTo(from.y, 9);
      expect(last.y).toBeCloseTo(to.y, 9);
    }
  });

  it('caps the grade everywhere at the authored maximum', () => {
    for (const edge of network.edges) {
      for (let index = 1; index < edge.points.length; index += 1) {
        const previous = edge.points[index - 1] as (typeof edge.points)[number];
        const point = edge.points[index] as (typeof edge.points)[number];
        const run = Math.hypot(point.x - previous.x, point.z - previous.z);
        const grade = Math.abs(point.y - previous.y) / Math.max(run, 0.001);
        expect(
          grade,
          `${edge.id} segment ${index}: ${previous.y} -> ${point.y} over ${run} m`,
        ).toBeLessThanOrEqual(edge.maxGrade + 1e-9);
      }
    }
  });
});

describe('terrain carve', () => {
  it('makes the world sampler agree with the road profile on the centreline', () => {
    for (const edge of network.edges) {
      for (let index = 4; index < edge.points.length - 4; index += 7) {
        const point = edge.points[index] as (typeof edge.points)[number];
        expect(world.heightAt(point.x, point.z)).toBeCloseTo(point.y, 6);
      }
    }
  });

  it('levels only the bounded Aohara core and returns to untouched seeded terrain outside', () => {
    const cityElevation = base.heightAt(
      AOHARA_DISTRICT_CONFIG.centerX,
      AOHARA_DISTRICT_CONFIG.centerZ,
    );
    for (const [dx, dz] of [
      [0, 0],
      [200, 0],
      [0, 200],
      [-160, 160],
      [320, 320],
      [-320, -320],
    ] as const) {
      expect(
        world.heightAt(AOHARA_DISTRICT_CONFIG.centerX + dx, AOHARA_DISTRICT_CONFIG.centerZ + dz),
      ).toBeCloseTo(cityElevation, 7);
    }
    const outsideX =
      AOHARA_DISTRICT_CONFIG.centerX + AOHARA_DISTRICT_CONFIG.terrainBlendRadiusMeters + 1;
    expect(world.roadAt?.(outsideX, AOHARA_DISTRICT_CONFIG.centerZ)).toBeNull();
    expect(world.heightAt(outsideX, AOHARA_DISTRICT_CONFIG.centerZ)).toBe(
      base.heightAt(outsideX, AOHARA_DISTRICT_CONFIG.centerZ),
    );
  });

  it('flattens the full pavement width to the profile elevation', () => {
    // Mid-edge on the south run, well away from junctions and bends.
    const point = centreOf('spawn-junction->north-bend');
    for (const [dx, dz] of [
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4],
    ] as const) {
      const road = world.roadAt?.(point.x + dx, point.z + dz);
      if (!road) {
        throw new Error('expected road influence across the pavement');
      }
      expect(road.distance).toBeLessThanOrEqual(ROAD_NETWORK_CONFIG.halfWidthMeters);
      expect(world.heightAt(point.x + dx, point.z + dz)).toBeCloseTo(road.elevation, 6);
    }
  });

  it('blends out smoothly and leaves distant terrain untouched', () => {
    expect(roadInfluence(ROAD_NETWORK_CONFIG, 0)).toBe(1);
    expect(roadInfluence(ROAD_NETWORK_CONFIG, ROAD_NETWORK_CONFIG.halfWidthMeters)).toBe(1);
    expect(roadInfluence(ROAD_NETWORK_CONFIG, ROAD_NETWORK_CONFIG.blendWidthMeters)).toBe(0);
    const midBlend = roadInfluence(ROAD_NETWORK_CONFIG, 20);
    expect(midBlend).toBeGreaterThan(0);
    expect(midBlend).toBeLessThan(1);
    // 200 m from the nearest road the world sampler is the base terrain exactly.
    const x = 900;
    const z = 900;
    expect(world.roadAt?.(x, z)).toBeNull();
    expect(world.heightAt(x, z)).toBe(base.heightAt(x, z));
  });

  it('never disturbs the spawn pad: the plateau stays exactly flat', () => {
    for (const [x, z] of [
      [0, 0],
      [20, 20],
      [-30, 10],
      [0, -40],
    ] as const) {
      expect(world.heightAt(x, z)).toBe(0);
    }
    // The junction is reachable ~170 m south: the road exists there.
    expect(world.roadAt?.(0, -170)).not.toBeNull();
  });
});

describe('road surfaces', () => {
  it('reports asphalt on the pavement, gravel on the shoulder, nature beyond', () => {
    const point = centreOf('spawn-junction->north-bend');
    expect(sampleTerrainSurface(world, point.x, point.z).id).toBe('asphalt');
    expect(sampleTerrainSurface(world, point.x, point.z).gripModifier).toBe(1);
    expect(
      sampleTerrainSurface(world, point.x + ROAD_NETWORK_CONFIG.halfWidthMeters + 1, point.z).id,
    ).toBe('gravel');
    const beyond = ROAD_NETWORK_CONFIG.halfWidthMeters + ROAD_NETWORK_CONFIG.shoulderMeters + 2;
    expect(sampleTerrainSurface(world, point.x + beyond, point.z).id).not.toBe('asphalt');
    expect(sampleTerrainSurface(world, point.x + beyond, point.z).id).not.toBe('gravel');
  });

  it('keeps the sample under the tyres on the plateau: spawn still reads grass', () => {
    const surface = sampleTerrainSurface(world, 0, 0);
    expect(surface.id).toBe('grass');
    expect(surface.gripModifier).toBeLessThan(1);
  });
});
