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
    'floor-band': 0,
    'corner-reveal': 0,
    penthouse: 0,
  };
  for (const placement of placements) {
    counts[placement.element] += 1;
  }
  return counts;
}

/** Expected street face of a building, mirroring `streetFrontSigns` for test assertions. */
function expectedStreetFace(building: FacadeKitBuildingRef): { lx: number; lz: number } {
  // Perimeter shells: the spec yaw rotates local +X radially outward, so the street face is
  // always local +X. Standalone kinds keep the local +Z front.
  if (building.kind === 'frontage' || building.kind === 'shop') {
    return { lx: 1, lz: 0 };
  }
  return { lx: 0, lz: 1 };
}

/** World-space point `protrude` metres off a building's street face line, plus the face length. */
function streetFaceCenter(
  building: FacadeKitBuildingRef,
  protrude = 0,
): { x: number; z: number; length: number } {
  const { lx, lz } = expectedStreetFace(building);
  const yaw = building.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  if (lz !== 0) {
    const distance = (building.depth / 2 + protrude) * lz;
    return {
      x: building.x + sin * distance,
      z: building.z + cos * distance,
      length: building.width,
    };
  }
  const distance = (building.width / 2 + protrude) * lx;
  return {
    x: building.x + cos * distance,
    z: building.z - sin * distance,
    length: building.depth,
  };
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
      expect(counts['floor-band']).toBeLessThanOrEqual(budget.floorBands);
      expect(counts['corner-reveal']).toBeLessThanOrEqual(budget.cornerReveals);
      expect(counts.penthouse).toBeLessThanOrEqual(budget.penthouses);
    }
    const c = countByElement(byTier.C);
    const b = countByElement(byTier.B);
    const a = countByElement(byTier.A);
    expect(a.balcony).toBeGreaterThan(c.balcony);
    expect(a.veranda).toBeGreaterThan(c.veranda);
    expect(a.chimney).toBeGreaterThan(c.chimney);
    expect(a['eave-trim']).toBeGreaterThan(c['eave-trim']);
    expect(a['curtain-fin']).toBeGreaterThanOrEqual(c['curtain-fin']);
    expect(a['glass-band']).toBeGreaterThanOrEqual(c['glass-band']);
    expect(a.awning).toBeGreaterThanOrEqual(c.awning);
    // Phase 8.3 rhythm elements: never below the lower tier on this fixture (the caps are
    // tuned per tier against the full city; strict tier ordering is asserted on the real
    // district in the density test below).
    expect(b['floor-band']).toBeGreaterThanOrEqual(c['floor-band']);
    expect(a['floor-band']).toBeGreaterThanOrEqual(b['floor-band']);
    expect(b['corner-reveal']).toBeGreaterThanOrEqual(c['corner-reveal']);
    expect(a['corner-reveal']).toBeGreaterThanOrEqual(b['corner-reveal']);
    expect(b.penthouse).toBeGreaterThanOrEqual(c.penthouse);
    expect(a.penthouse).toBeGreaterThanOrEqual(b.penthouse);
  });

  it('attaches buildings-side elements to the street-facing face at plausible heights', () => {
    const buildings = fixtureBuildings();
    const towers = fixtureTowers();
    const placements = generateFacadeKitPlacements('A', buildings, towers);
    const wallSideElements: FacadeKitElement[] = ['balcony', 'veranda', 'eave-trim', 'awning'];
    // Protrusion of each wall-side element's placement point from the street face line.
    const protrusionFor: Partial<Record<FacadeKitElement, number>> = {
      balcony: 0.4,
      veranda: 0.55,
      'eave-trim': 0.32,
      awning: 0.42,
      'floor-band': 0.04,
    };
    for (const placement of placements) {
      if (placement.buildingIndex < 0) continue;
      const building = buildings[placement.buildingIndex]!;
      const face = streetFaceCenter(building, protrusionFor[placement.element] ?? 0);
      switch (placement.element) {
        case 'balcony':
          expect(placement.y).toBeGreaterThanOrEqual(FACADE_KIT_BASE_Y + 2.8);
          expect(placement.y).toBeLessThanOrEqual(FACADE_KIT_BASE_Y + 8.6);
          expect(placement.x).toBeCloseTo(face.x, 6);
          expect(placement.z).toBeCloseTo(face.z, 6);
          expect(placement.scale[0]).toBeGreaterThanOrEqual(1.8 / 2.2 - 1e-9);
          expect(placement.scale[0]).toBeLessThanOrEqual(2.6 / 2.2 + 1e-9);
          break;
        case 'veranda':
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y, 6);
          expect(placement.x).toBeCloseTo(face.x, 6);
          expect(placement.z).toBeCloseTo(face.z, 6);
          break;
        case 'chimney':
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y + building.height + 0.55, 6);
          break;
        case 'eave-trim':
        case 'awning':
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y, 6);
          expect(placement.x).toBeCloseTo(face.x, 6);
          expect(placement.z).toBeCloseTo(face.z, 6);
          break;
        case 'floor-band':
          // Bands sit just proud of the street face and span its full length.
          expect(placement.y).toBeGreaterThanOrEqual(FACADE_KIT_BASE_Y + 3.1);
          expect(placement.y).toBeLessThan(FACADE_KIT_BASE_Y + building.height - 0.7);
          expect(placement.x).toBeCloseTo(face.x, 6);
          expect(placement.z).toBeCloseTo(face.z, 6);
          expect(placement.scale[0]).toBeCloseTo(face.length, 6);
          break;
        case 'corner-reveal': {
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y, 6);
          expect(placement.scale[1]).toBeCloseTo(building.height, 6);
          // The strip hugs a street-face corner: its centre sits 0.07 m inboard of the face
          // line (the 0.14 m section is flush with the wall) and at the face's end.
          const { lx, lz } = expectedStreetFace(building);
          const yaw = building.yaw ?? 0;
          const cos = Math.cos(yaw);
          const sin = Math.sin(yaw);
          const nx = lz !== 0 ? sin * lz : cos * lx;
          const nz = lz !== 0 ? cos * lz : -sin * lx;
          const ax = -nz;
          const az = nx;
          const beyond = (placement.x - face.x) * nx + (placement.z - face.z) * nz;
          const along = (placement.x - face.x) * ax + (placement.z - face.z) * az;
          expect(beyond).toBeCloseTo(-0.07, 6);
          const endLength = lz !== 0 ? building.width : building.depth;
          expect(Math.abs(along)).toBeCloseTo(endLength / 2 - 0.07, 6);
          break;
        }
        case 'penthouse':
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y + building.height, 6);
          expect(placement.scale[0]).toBeLessThanOrEqual(building.width * 0.4 + 1e-9);
          expect(placement.scale[2]).toBeLessThanOrEqual(building.depth * 0.34 + 1e-9);
          break;
        default:
          throw new Error(`unexpected building-side element: ${placement.element}`);
      }
      // No wall-side element may sit farther than 1.3 m past the street face line.
      if (wallSideElements.includes(placement.element)) {
        const { lx, lz } = expectedStreetFace(building);
        const yaw = building.yaw ?? 0;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const line = streetFaceCenter(building);
        const nx = lz !== 0 ? sin * lz : cos * lx;
        const nz = lz !== 0 ? cos * lz : -sin * lx;
        const beyond = (placement.x - line.x) * nx + (placement.z - line.z) * nz;
        expect(beyond).toBeLessThanOrEqual(1.3);
        expect(beyond).toBeGreaterThanOrEqual(-0.05);
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
    // Phase 8.3: every tower gets a crown band plus a mid spandrel at two-thirds height.
    const bands = placements.filter((placement) => placement.element === 'glass-band');
    expect(bands.length).toBe(towers.length * 2);
    for (const tower of towers) {
      const towerBands = bands.filter((band) => band.towerIndex === towers.indexOf(tower));
      expect(towerBands.length).toBe(2);
      const ys = towerBands.map((band) => band.y - FACADE_KIT_BASE_Y).sort((a, b) => a - b);
      expect(ys[0]).toBeCloseTo(tower.height * (2 / 3), 6);
      expect(ys[1]).toBeCloseTo(tower.height - 2.2, 6);
      for (const band of towerBands) {
        expect(band.scale[0]).toBeCloseTo(tower.width + 0.12, 6);
        expect(band.scale[2]).toBeCloseTo(tower.depth + 0.12, 6);
      }
    }
  });

  it('never stacks placements of the same element beyond their per-building design cap', () => {
    // Most elements are at most one per building. Phase 8.3 exceptions: stacked balcony slabs
    // (up to three floor lines), floor bands (up to three), corner reveals (two corners), and
    // the tower's crown + mid glass bands (two per tower).
    const maxPerBuilding: Partial<Record<FacadeKitElement, number>> = {
      balcony: 3,
      'floor-band': 3,
      'corner-reveal': 2,
      'glass-band': 2,
    };
    for (const tier of ['C', 'B', 'A'] as const) {
      const placements = generateFacadeKitPlacements(tier, fixtureBuildings(), fixtureTowers());
      const perBuilding = new Map<string, number>();
      const finsPerTower = new Map<number, number>();
      for (const placement of placements) {
        if (placement.element === 'curtain-fin') {
          const tower = placement.towerIndex ?? -1;
          finsPerTower.set(tower, (finsPerTower.get(tower) ?? 0) + 1);
          continue;
        }
        const key = `${placement.element}:${placement.buildingIndex}:${placement.towerIndex ?? -1}`;
        const count = (perBuilding.get(key) ?? 0) + 1;
        perBuilding.set(key, count);
        expect(count).toBeLessThanOrEqual(maxPerBuilding[placement.element] ?? 1);
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
    // Phase 8.3 raised the kit from seven to ten element kinds.
    expect(meshes.length).toBeLessThanOrEqual(10);
    const stats = kit.getContentStats();
    const counts = countByElement(kit.placements);
    expect(stats.facadeKitBalconies).toBe(counts.balcony);
    expect(stats.facadeKitVerandas).toBe(counts.veranda);
    expect(stats.facadeKitChimneys).toBe(counts.chimney);
    expect(stats.facadeKitEaveTrims).toBe(counts['eave-trim']);
    expect(stats.facadeKitCurtainFins).toBe(counts['curtain-fin']);
    expect(stats.facadeKitGlassBands).toBe(counts['glass-band']);
    expect(stats.facadeKitAwnings).toBe(counts.awning);
    expect(stats.facadeKitFloorBands).toBe(counts['floor-band']);
    expect(stats.facadeKitCornerReveals).toBe(counts['corner-reveal']);
    expect(stats.facadeKitPenthouses).toBe(counts.penthouse);
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
      expect(stats.facadeKitFloorBands).toBeLessThanOrEqual(budget.floorBands);
      expect(stats.facadeKitCornerReveals).toBeLessThanOrEqual(budget.cornerReveals);
      expect(stats.facadeKitPenthouses).toBeLessThanOrEqual(budget.penthouses);
      expect(stats.facadeKitBatches).toBeLessThanOrEqual(10);
    } finally {
      city.dispose();
    }
  });

  it('targets every block side of a perimeter shell on its true street face', () => {
    // Phase 8.3 regression guard: the 8.1 kit aimed detail at the local +Z face, which for
    // block-perimeter shells is the alley-adjacent side. The road-facing side is local ±X.
    const origin = { x: 0, z: 0 };
    const sides: Array<{ yaw: number; outward: readonly [number, number] }> = [
      { yaw: 0, outward: [1, 0] }, // east: street face is local +X
      { yaw: Math.PI, outward: [-1, 0] }, // west: local -X
      { yaw: Math.PI / 2, outward: [0, -1] }, // north: local -X
      { yaw: -Math.PI / 2, outward: [0, 1] }, // south: local +X
    ];
    sides.forEach(({ yaw, outward }) => {
      const building: FacadeKitBuildingRef = {
        kind: 'frontage',
        x: origin.x,
        z: origin.z,
        width: 8.5,
        depth: 20,
        height: 11,
        roofStyle: 'flat',
        yaw,
        frontage: true,
      };
      const placements = generateFacadeKitPlacements('A', [building], []);
      const bands = placements.filter((placement) => placement.element === 'floor-band');
      expect(bands.length).toBeGreaterThanOrEqual(2);
      for (const band of bands) {
        // The band must sit on the street side of the shell centre, not the alley side.
        const dx = band.x - origin.x;
        const dz = band.z - origin.z;
        expect(dx * outward[0] + dz * outward[1]).toBeGreaterThan(0);
        // ...and at the street-face line (width/2 + 0.04 m), within the 20 m face span.
        const { lx, lz } = expectedStreetFace(building);
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const nx = lz !== 0 ? sin * lz : cos * lx;
        const nz = lz !== 0 ? cos * lz : -sin * lx;
        expect(dx * nx + dz * nz).toBeCloseTo(8.5 / 2 + 0.04, 6);
        const ax = -nz;
        const az = nx;
        expect(Math.abs(dx * ax + dz * az)).toBeLessThanOrEqual(10 + 1e-6);
      }
      // Corner reveals flank the street face, not the alley face.
      const corners = placements.filter((placement) => placement.element === 'corner-reveal');
      expect(corners.length).toBe(2);
      for (const corner of corners) {
        const dx = corner.x - origin.x;
        const dz = corner.z - origin.z;
        expect(dx * outward[0] + dz * outward[1]).toBeGreaterThan(0);
      }
    });
  });

  it('dresses nearly every street-facing shell and scales C < B < A across the district', () => {
    // Owner verdict "still big boxes": density must be visible from the road, i.e. most
    // block-perimeter shells need floor rhythm, corner treatment, and rooftop mass.
    const byTier: Record<'C' | 'B' | 'A', Record<string, number>> = {} as Record<
      'C' | 'B' | 'A',
      Record<string, number>
    >;
    for (const tier of ['C', 'B', 'A'] as const) {
      const city = new UrbanNightWorld(tier, { networkIntegrated: true });
      try {
        byTier[tier] = city.getContentStats();
      } finally {
        city.dispose();
      }
    }
    const num = (stats: Record<string, number>, key: string): number => {
      const value = stats[key];
      if (value === undefined) throw new Error(`missing night-world stat: ${key}`);
      return value;
    };
    const a = byTier.A;
    const b = byTier.B;
    const c = byTier.C;
    const shells = num(a, 'frontageBuildings');
    expect(shells).toBeGreaterThan(0);
    // Every shell is at least 8.2 m tall, so each qualifies for two floor bands; the tier
    // budget must keep at least two per shell.
    expect(num(a, 'facadeKitFloorBands')).toBeGreaterThanOrEqual(shells * 2 - 6);
    // Corner reveals pair up per shell: at most six shells miss a corner.
    expect(num(a, 'facadeKitCornerReveals')).toBeGreaterThanOrEqual(shells * 2 - 12);
    // Nearly every perimeter shell is a flat roof and gets a penthouse.
    expect(num(a, 'facadeKitPenthouses')).toBeGreaterThanOrEqual(Math.floor(shells * 0.85));
    // Ground-floor commerce: every shop keeps a canopy, plus a large share of frontages.
    expect(num(a, 'facadeKitAwnings')).toBeGreaterThanOrEqual(num(a, 'shops'));
    expect(num(a, 'facadeKitAwnings')).toBeGreaterThanOrEqual(Math.floor(shells * 0.1));
    // Both glass bands survive on every high-rise.
    expect(num(a, 'facadeKitGlassBands')).toBe(num(a, 'highRiseBuildings') * 2);
    // Strict density ordering on the real district.
    expect(num(b, 'facadeKitFloorBands')).toBeGreaterThan(num(c, 'facadeKitFloorBands'));
    expect(num(a, 'facadeKitFloorBands')).toBeGreaterThan(num(b, 'facadeKitFloorBands'));
    expect(num(b, 'facadeKitCornerReveals')).toBeGreaterThan(num(c, 'facadeKitCornerReveals'));
    expect(num(a, 'facadeKitCornerReveals')).toBeGreaterThan(num(b, 'facadeKitCornerReveals'));
    expect(num(b, 'facadeKitPenthouses')).toBeGreaterThan(num(c, 'facadeKitPenthouses'));
    expect(num(a, 'facadeKitPenthouses')).toBeGreaterThan(num(b, 'facadeKitPenthouses'));
  });
});
