import { InstancedMesh, Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { URBAN_FACADE_KIT_TIER_BUDGET } from '../../src/config/urban-city';
import {
  FACADE_KIT_BASE_Y,
  FacadeKitWorld,
  generateFacadeKitPlacements,
  type FacadeKitBuildingRef,
  type FacadeKitElement,
  type FacadeKitPlacement,
  type FacadeKitTowerRef,
} from '../../src/world/building-facades';
import { UrbanNightWorld } from '../../src/world/urban-night';

function fixtureBuildings(): FacadeKitBuildingRef[] {
  const buildings: FacadeKitBuildingRef[] = [];
  // Twelve small hipped houses, six mansions, eight flat townhouses, six infill shells.
  for (let i = 0; i < 12; i += 1) {
    buildings.push({
      kind: 'house',
      x: -60 + i * 12,
      z: 60,
      width: 6.5,
      depth: 7.5,
      height: 5.5 + (i % 4) * 1.1,
      roofStyle: 'hipped',
      yaw: i % 3 === 0 ? Math.PI / 2 : 0,
    });
  }
  for (let i = 0; i < 6; i += 1) {
    buildings.push({
      kind: 'mansion',
      x: -24 + i * 12,
      z: 92,
      width: 9 + i,
      depth: 10,
      height: 8 + i,
      roofStyle: 'hipped',
      yaw: 0,
    });
  }
  for (let i = 0; i < 8; i += 1) {
    buildings.push({
      kind: 'townhouse',
      x: -36 + i * 10,
      z: -70,
      width: 7.5,
      depth: 12,
      height: 6 + (i % 3),
      roofStyle: 'flat',
      yaw: Math.PI,
    });
  }
  for (let i = 0; i < 6; i += 1) {
    buildings.push({
      kind: 'infill',
      x: 60 + i * 14,
      z: 40,
      width: 8,
      depth: 9,
      height: 5 + i * 0.7,
      roofStyle: i % 2 === 0 ? 'hipped' : 'flat',
      yaw: i % 2 === 0 ? -Math.PI / 2 : 0,
    });
  }
  for (let i = 0; i < 4; i += 1) {
    buildings.push({
      kind: 'shop',
      x: -90 + i * 16,
      z: -10,
      width: 8 + i,
      depth: 9,
      height: 5.6 + i * 0.5,
      roofStyle: 'flat',
      yaw: 0,
    });
  }
  for (let i = 0; i < 4; i += 1) {
    buildings.push({
      kind: 'frontage',
      x: 30 + i * 15,
      z: -90,
      width: 7 + i,
      depth: 8,
      height: 6 + i * 0.4,
      roofStyle: i % 2 === 0 ? 'hipped' : 'flat',
      yaw: 0,
      frontage: true,
    });
  }
  return buildings;
}

function fixtureTowers(): FacadeKitTowerRef[] {
  return [
    { x: -31, z: -57, width: 22, depth: 26, height: 58 },
    { x: -31, z: -30, width: 22, depth: 22, height: 82 },
    { x: 31, z: 30, width: 22, depth: 22, height: 54 },
    { x: 31, z: 57, width: 24, depth: 28, height: 100 },
  ];
}

function countByElement(
  placements: readonly FacadeKitPlacement[],
): Record<FacadeKitElement, number> {
  const counts: Record<FacadeKitElement, number> = {
    balcony: 0,
    veranda: 0,
    chimney: 0,
    'eave-trim': 0,
    'curtain-fin': 0,
    'glass-band': 0,
    awning: 0,
  };
  for (const placement of placements) {
    counts[placement.element] += 1;
  }
  return counts;
}

describe('Aohara facade kit', () => {
  it('places kit elements deterministically for the same city', () => {
    const buildings = fixtureBuildings();
    const towers = fixtureTowers();
    const first = generateFacadeKitPlacements('B', buildings, towers);
    const second = generateFacadeKitPlacements('B', buildings, towers);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.length).toBeGreaterThan(0);
  });

  it('stays inside the tier budgets and never shrinks from C to A', () => {
    const buildings = fixtureBuildings();
    const towers = fixtureTowers();
    const byTier = {
      C: generateFacadeKitPlacements('C', buildings, towers),
      B: generateFacadeKitPlacements('B', buildings, towers),
      A: generateFacadeKitPlacements('A', buildings, towers),
    };
    for (const tier of ['C', 'B', 'A'] as const) {
      const counts = countByElement(byTier[tier]);
      const budget = URBAN_FACADE_KIT_TIER_BUDGET[tier];
      expect(counts.balcony).toBeLessThanOrEqual(budget.balconies);
      expect(counts.veranda).toBeLessThanOrEqual(budget.verandas);
      expect(counts.chimney).toBeLessThanOrEqual(budget.chimneys);
      expect(counts['eave-trim']).toBeLessThanOrEqual(budget.eaveTrims);
      expect(counts['curtain-fin']).toBeLessThanOrEqual(budget.curtainFins);
      expect(counts['glass-band']).toBeLessThanOrEqual(budget.glassBands);
      expect(counts.awning).toBeLessThanOrEqual(budget.awnings);
    }
    const c = countByElement(byTier.C);
    const a = countByElement(byTier.A);
    expect(a.balcony).toBeGreaterThan(c.balcony);
    expect(a.veranda).toBeGreaterThan(c.veranda);
    expect(a.chimney).toBeGreaterThan(c.chimney);
    expect(a['eave-trim']).toBeGreaterThan(c['eave-trim']);
    expect(a['curtain-fin']).toBeGreaterThanOrEqual(c['curtain-fin']);
    expect(a['glass-band']).toBeGreaterThanOrEqual(c['glass-band']);
    expect(a.awning).toBeGreaterThanOrEqual(c.awning);
  });

  it('attaches buildings-side elements to the street-facing face at plausible heights', () => {
    const buildings = fixtureBuildings();
    const towers = fixtureTowers();
    const placements = generateFacadeKitPlacements('A', buildings, towers);
    for (const placement of placements) {
      if (placement.buildingIndex < 0) continue;
      const building = buildings[placement.buildingIndex]!;
      const yaw = building.yaw ?? 0;
      const frontX = building.x + Math.sin(yaw) * (building.depth / 2 + 0.4);
      const frontZ = building.z + Math.cos(yaw) * (building.depth / 2 + 0.4);
      switch (placement.element) {
        case 'balcony':
          expect(placement.y).toBeGreaterThanOrEqual(FACADE_KIT_BASE_Y + 2.8);
          expect(placement.y).toBeLessThanOrEqual(FACADE_KIT_BASE_Y + 5.8);
          expect(placement.x).toBeCloseTo(frontX, 6);
          expect(placement.z).toBeCloseTo(frontZ, 6);
          expect(placement.scale[0]).toBeGreaterThanOrEqual(1.8 / 2.2 - 1e-9);
          expect(placement.scale[0]).toBeLessThanOrEqual(2.6 / 2.2 + 1e-9);
          break;
        case 'veranda':
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y, 6);
          break;
        case 'chimney':
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y + building.height + 0.55, 6);
          break;
        case 'eave-trim':
        case 'awning':
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y, 6);
          break;
        default:
          throw new Error(`unexpected building-side element: ${placement.element}`);
      }
    }
  });

  it('wraps tower faces with curtain fins and a crown glass band', () => {
    const buildings = fixtureBuildings();
    const towers = fixtureTowers();
    const placements = generateFacadeKitPlacements('A', buildings, towers);
    const fins = placements.filter((placement) => placement.element === 'curtain-fin');
    expect(fins.length).toBe(towers.length * 6);
    for (const fin of fins) {
      const tower = towers[fin.towerIndex!]!;
      expect(Math.abs(fin.x - tower.x)).toBeLessThanOrEqual(tower.width / 2 + 0.05);
      expect(Math.abs(fin.z - tower.z)).toBeLessThanOrEqual(tower.depth / 2 + 0.05);
      expect(fin.y).toBeCloseTo(FACADE_KIT_BASE_Y + tower.height / 2, 6);
      expect(fin.scale[1]).toBeCloseTo(tower.height, 6);
    }
    const bands = placements.filter((placement) => placement.element === 'glass-band');
    expect(bands.length).toBe(towers.length);
    for (const band of bands) {
      const tower = towers[band.towerIndex!]!;
      expect(band.y).toBeCloseTo(FACADE_KIT_BASE_Y + tower.height - 2.2, 6);
      expect(band.scale[0]).toBeCloseTo(tower.width + 0.12, 6);
      expect(band.scale[2]).toBeCloseTo(tower.depth + 0.12, 6);
    }
  });

  it('never stacks two placements of the same element on one building or tower face', () => {
    for (const tier of ['C', 'B', 'A'] as const) {
      const placements = generateFacadeKitPlacements(tier, fixtureBuildings(), fixtureTowers());
      // Every element is at most one per building, except curtain fins which occupy the six
      // face slots (four corners + two centrelines) of each tower by design.
      const buildingKeys = new Set<string>();
      const finsPerTower = new Map<number, number>();
      for (const placement of placements) {
        if (placement.element === 'curtain-fin') {
          const tower = placement.towerIndex ?? -1;
          finsPerTower.set(tower, (finsPerTower.get(tower) ?? 0) + 1);
          continue;
        }
        const key = `${placement.element}:${placement.buildingIndex}:${placement.towerIndex ?? -1}`;
        expect(buildingKeys.has(key)).toBe(false);
        buildingKeys.add(key);
      }
      for (const count of finsPerTower.values()) {
        expect(count).toBeLessThanOrEqual(6);
      }
    }
  });

  it('builds one instanced batch per element with matching stats', () => {
    const kit = new FacadeKitWorld('A', fixtureBuildings(), fixtureTowers(), [0, 0, 0]);
    expect(kit.root.name).toBe('aohara-facade-kit');
    const meshes = kit.root.children.filter(
      (child): child is InstancedMesh => child instanceof InstancedMesh,
    );
    expect(meshes.length).toBe(kit.root.children.length);
    expect(meshes.length).toBeLessThanOrEqual(7);
    const stats = kit.getContentStats();
    const counts = countByElement(kit.placements);
    expect(stats.facadeKitBalconies).toBe(counts.balcony);
    expect(stats.facadeKitVerandas).toBe(counts.veranda);
    expect(stats.facadeKitChimneys).toBe(counts.chimney);
    expect(stats.facadeKitEaveTrims).toBe(counts['eave-trim']);
    expect(stats.facadeKitCurtainFins).toBe(counts['curtain-fin']);
    expect(stats.facadeKitGlassBands).toBe(counts['glass-band']);
    expect(stats.facadeKitAwnings).toBe(counts.awning);
    expect(stats.facadeKitBatches).toBe(meshes.length);
    for (const mesh of meshes) {
      expect(mesh.geometry.getAttribute('position')).toBeDefined();
      expect(mesh.geometry.getAttribute('normal')).toBeDefined();
    }
  });

  it('keeps veranda and balcony overhangs inside the shell-safe envelope', () => {
    const kit = new FacadeKitWorld('A', fixtureBuildings(), fixtureTowers(), [0, 0, 0]);
    for (const placement of kit.placements) {
      if (placement.element === 'veranda') {
        // Slab extends 1.1 m in local +Z, scaled only in X: front overhang stays under 1.3 m.
        expect(placement.scale[2]).toBe(1);
      }
      if (placement.element === 'balcony') {
        expect(placement.scale[2]).toBe(1);
      }
    }
    kit.dispose();
  });

  it('disposes exactly once and detaches its root', () => {
    const kit = new FacadeKitWorld('C', fixtureBuildings(), fixtureTowers(), [0, 0, 0]);
    const parent = new Object3D();
    parent.add(kit.root);
    expect(kit.root.parent).toBe(parent);
    kit.dispose();
    expect(kit.root.parent).toBeNull();
    kit.dispose();
    expect(kit.root.parent).toBeNull();
  });

  it('wires the facade kit into the night world within its tier budget', () => {
    const city = new UrbanNightWorld('C');
    try {
      const stats = city.getContentStats();
      const budget = URBAN_FACADE_KIT_TIER_BUDGET.C;
      expect(city.root.getObjectByName('aohara-facade-kit')).toBeDefined();
      expect(stats.facadeKitBalconies).toBeGreaterThanOrEqual(0);
      expect(stats.facadeKitBalconies).toBeLessThanOrEqual(budget.balconies);
      expect(stats.facadeKitCurtainFins).toBeGreaterThanOrEqual(0);
      expect(stats.facadeKitCurtainFins).toBeLessThanOrEqual(budget.curtainFins);
      expect(stats.facadeKitBatches).toBeLessThanOrEqual(7);
    } finally {
      city.dispose();
    }
  });
});
