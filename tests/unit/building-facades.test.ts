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
    mast: 0,
    'storefront-glazing': 0,
    'ground-cladding': 0,
    'crown-cladding': 0,
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

/**
 * Phase 8.3c: the rhythm elements dress all four walls. Return every face the point lies on
 * (within 0.6 m of the face line and inside the face span), with the signed distance from the
 * face line (positive outward) and the distance along the face. A corner point matches two
 * faces; a wall-line point matches exactly one.
 */
function locateOnFaces(
  building: FacadeKitBuildingRef,
  px: number,
  pz: number,
): Array<{ beyond: number; along: number; length: number }> {
  const yaw = building.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const faces: Array<{ lx: number; lz: number; length: number }> = [
    { lx: 1, lz: 0, length: building.depth },
    { lx: -1, lz: 0, length: building.depth },
    { lx: 0, lz: 1, length: building.width },
    { lx: 0, lz: -1, length: building.width },
  ];
  const matches: Array<{ beyond: number; along: number; length: number }> = [];
  for (const face of faces) {
    const faceX =
      building.x +
      (face.lz !== 0 ? sin * building.depth * 0.5 * face.lz : cos * building.width * 0.5 * face.lx);
    const faceZ =
      building.z +
      (face.lz !== 0
        ? cos * building.depth * 0.5 * face.lz
        : -sin * building.width * 0.5 * face.lx);
    const nx = face.lz !== 0 ? sin * face.lz : cos * face.lx;
    const nz = face.lz !== 0 ? cos * face.lz : -sin * face.lx;
    const dx = px - faceX;
    const dz = pz - faceZ;
    const beyond = dx * nx + dz * nz;
    if (Math.abs(beyond) > 0.6) continue;
    const along = -dx * nz + dz * nx;
    if (Math.abs(along) > face.length / 2 + 0.6) continue;
    matches.push({ beyond, along, length: face.length });
  }
  return matches;
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
      expect(counts.mast).toBeLessThanOrEqual(budget.masts);
      expect(counts['storefront-glazing']).toBeLessThanOrEqual(budget.storefrontGlazing);
      expect(counts['ground-cladding']).toBeLessThanOrEqual(budget.groundCladding);
      expect(counts['crown-cladding']).toBeLessThanOrEqual(budget.crownCladding);
    }
    const c = countByElement(byTier.C);
    const b = countByElement(byTier.B);
    const a = countByElement(byTier.A);
    // Balcony budgets now exceed this small fixture's candidate pool, so the fixture counts
    // can tie between tiers; strict ordering is asserted on the real district below.
    expect(a.balcony).toBeGreaterThanOrEqual(c.balcony);
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
    expect(b.mast).toBeGreaterThanOrEqual(c.mast);
    expect(a.mast).toBeGreaterThanOrEqual(b.mast);
    // The shopfront rows depend only on frontage/shop shells, which are tier-independent.
    expect(a['storefront-glazing']).toBe(c['storefront-glazing']);
    expect(b['ground-cladding']).toBeGreaterThanOrEqual(c['ground-cladding']);
    expect(a['ground-cladding']).toBeGreaterThanOrEqual(b['ground-cladding']);
    expect(b['crown-cladding']).toBeGreaterThanOrEqual(c['crown-cladding']);
    expect(a['crown-cladding']).toBeGreaterThanOrEqual(b['crown-cladding']);
  });

  it('attaches buildings-side elements to the street-facing face at plausible heights', () => {
    const buildings = fixtureBuildings();
    const towers = fixtureTowers();
    const placements = generateFacadeKitPlacements('A', buildings, towers);
    // Commerce elements stay on the street face; the cladding/bands/corners dress all walls
    // and are validated per-face in their own cases.
    const streetSideElements: FacadeKitElement[] = [
      'balcony',
      'veranda',
      'eave-trim',
      'awning',
      'storefront-glazing',
    ];
    // Protrusion of each street-side element's placement point from the street face line.
    const protrusionFor: Partial<Record<FacadeKitElement, number>> = {
      balcony: 0.4,
      veranda: 0.55,
      'eave-trim': 0.32,
      awning: 0.42,
      'floor-band': 0.04,
      'storefront-glazing': 0.13,
      'ground-cladding': 0.05,
      'crown-cladding': 0.05,
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
        case 'floor-band': {
          // Phase 8.3c: bands dress every wall — on one face line, just proud (0.04 m),
          // spanning its full length, on the 2.6 m window-floor rhythm. Phase 8.3e: the
          // last podium band may sit at the step (terrace cornice), 0.03 m under the top.
          expect(placement.y).toBeGreaterThanOrEqual(FACADE_KIT_BASE_Y + 2.97 - 1e-6);
          expect(placement.y).toBeLessThan(FACADE_KIT_BASE_Y + building.height - 0.03 + 1e-6);
          const floorsDown = (placement.y - FACADE_KIT_BASE_Y - 2.97) / 2.6;
          expect(Math.abs(floorsDown - Math.round(floorsDown))).toBeLessThan(1e-6);
          const onFaces = locateOnFaces(building, placement.x, placement.z);
          expect(onFaces.length).toBe(1);
          expect(onFaces[0]!.beyond).toBeCloseTo(0.04, 6);
          expect(onFaces[0]!.along).toBeCloseTo(0, 6);
          expect(placement.scale[0]).toBeCloseTo(onFaces[0]!.length, 6);
          break;
        }
        case 'corner-reveal': {
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y, 6);
          // Phase 8.3e: the pilaster follows the podium (full height + 0.1 m on single
          // volumes, which the fixtures are).
          expect(placement.scale[1]).toBeCloseTo(building.height + 0.1, 6);
          // Phase 8.3c: one strip at each of the four corners — the centre sits 0.12 m inboard
          // of both adjacent face lines (the 0.3 m section stands 0.03 m proud) and at the
          // end of both faces.
          const onFaces = locateOnFaces(building, placement.x, placement.z);
          expect(onFaces.length).toBe(2);
          for (const faceMatch of onFaces) {
            expect(faceMatch.beyond).toBeCloseTo(-0.12, 6);
            expect(Math.abs(faceMatch.along)).toBeCloseTo(faceMatch.length / 2 - 0.12, 6);
          }
          break;
        }
        case 'mast': {
          // Phase 8.3d: a slim pole standing on the flat roof, within the roof outline.
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y + building.height, 6);
          expect(placement.scale[0]).toBeCloseTo(1, 6);
          expect(placement.scale[2]).toBeCloseTo(1, 6);
          expect(placement.scale[1]).toBeGreaterThanOrEqual(2.5 - 1e-9);
          expect(placement.scale[1]).toBeLessThanOrEqual(6.0 + 1e-9);
          const yaw = building.yaw ?? 0;
          const localX =
            (placement.x - building.x) * Math.cos(yaw) - (placement.z - building.z) * Math.sin(yaw);
          const localZ =
            (placement.x - building.x) * Math.sin(yaw) + (placement.z - building.z) * Math.cos(yaw);
          expect(Math.abs(localX)).toBeLessThanOrEqual(building.width * 0.15 + 1e-6);
          expect(Math.abs(localZ)).toBeLessThanOrEqual(building.depth * 0.15 + 1e-6);
          break;
        }
        case 'storefront-glazing': {
          // Phase 8.3d: a shopfront unit on the street face ground level, 0.13 m out, within
          // the face span (rows are centered, 4.2 m pitch).
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y + 1.55, 6);
          expect(placement.scale[0]).toBeCloseTo(3.4, 6);
          expect(placement.scale[1]).toBeCloseTo(2.6, 6);
          expect(placement.scale[2]).toBeCloseTo(0.16, 6);
          const onFaces = locateOnFaces(building, placement.x, placement.z);
          expect(onFaces.length).toBe(1);
          expect(onFaces[0]!.beyond).toBeCloseTo(0.13, 6);
          expect(Math.abs(onFaces[0]!.along)).toBeLessThanOrEqual(onFaces[0]!.length / 2);
          break;
        }
        case 'ground-cladding': {
          // Phase 8.3c: the dark base band dresses every wall, from ground level.
          // Phase 8.3e: flush with the wall (behind the glazing plane).
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y, 6);
          expect(placement.scale[1]).toBeCloseTo(3.0, 6);
          const onFaces = locateOnFaces(building, placement.x, placement.z);
          expect(onFaces.length).toBe(1);
          expect(onFaces[0]!.beyond).toBeCloseTo(0, 6);
          expect(onFaces[0]!.along).toBeCloseTo(0, 6);
          expect(placement.scale[0]).toBeCloseTo(onFaces[0]!.length, 6);
          break;
        }
        case 'crown-cladding': {
          // Phase 8.3c: the parapet band dresses the top 1.8 m of every wall.
          // Phase 8.3e: flush with the wall (behind the top window row).
          expect(placement.y).toBeCloseTo(FACADE_KIT_BASE_Y + building.height - 0.9, 6);
          expect(placement.scale[1]).toBeCloseTo(1.8, 6);
          const onFaces = locateOnFaces(building, placement.x, placement.z);
          expect(onFaces.length).toBe(1);
          expect(onFaces[0]!.beyond).toBeCloseTo(0, 6);
          expect(onFaces[0]!.along).toBeCloseTo(0, 6);
          expect(placement.scale[0]).toBeCloseTo(onFaces[0]!.length, 6);
          break;
        }
        default:
          throw new Error(`unexpected building-side element: ${placement.element}`);
      }
      // No street-side element may sit farther than 1.3 m past the street face line.
      if (streetSideElements.includes(placement.element)) {
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
    // Most elements are at most one per building. Phase 8.3/8.3b/8.3c exceptions: stacked
    // balcony slabs (up to three floor lines), floor bands (four faces x up to five floors),
    // corner reveals (four corners), ground/crown cladding (four faces), and the tower's
    // crown + mid glass bands (two per tower).
    const maxPerBuilding: Partial<Record<FacadeKitElement, number>> = {
      balcony: 3,
      // Phase 8.3e: podium bands + upper-volume bands per face (up to ~9 each, four faces).
      'floor-band': 40,
      'corner-reveal': 4,
      'glass-band': 2,
      'storefront-glazing': 6,
      'ground-cladding': 4,
      'crown-cladding': 4,
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
    // Phase 8.3 raised the kit from seven to ten element kinds; 8.3b adds two cladding bands;
    // 8.3d swaps the penthouse for a mast plus the shopfront glazing row (thirteen kinds).
    expect(meshes.length).toBeLessThanOrEqual(13);
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
    expect(stats.facadeKitMasts).toBe(counts.mast);
    expect(stats.facadeKitStorefrontGlazing).toBe(counts['storefront-glazing']);
    expect(stats.facadeKitGroundCladding).toBe(counts['ground-cladding']);
    expect(stats.facadeKitCrownCladding).toBe(counts['crown-cladding']);
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
      expect(stats.facadeKitMasts).toBeLessThanOrEqual(budget.masts);
      expect(stats.facadeKitStorefrontGlazing).toBeLessThanOrEqual(budget.storefrontGlazing);
      expect(stats.facadeKitGroundCladding).toBeLessThanOrEqual(budget.groundCladding);
      expect(stats.facadeKitCrownCladding).toBeLessThanOrEqual(budget.crownCladding);
      expect(stats.facadeKitBatches).toBeLessThanOrEqual(13);
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
      const streetBeyond = (x: number, z: number): number =>
        (x - origin.x) * outward[0] + (z - origin.z) * outward[1];
      // Phase 8.3c: the street face is dressed like the other three walls; every floor-band
      // on it must sit at the street-face line, and the alley face gets its own set.
      const streetBands = placements
        .filter(
          (placement) =>
            placement.element === 'floor-band' && streetBeyond(placement.x, placement.z) > 1,
        )
        .map((placement) => ({ x: placement.x, z: placement.z }));
      expect(streetBands.length).toBeGreaterThanOrEqual(2);
      const { lx, lz } = expectedStreetFace(building);
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const nx = lz !== 0 ? sin * lz : cos * lx;
      const nz = lz !== 0 ? cos * lz : -sin * lx;
      for (const band of streetBands) {
        const dx = band.x - origin.x;
        const dz = band.z - origin.z;
        expect(dx * nx + dz * nz).toBeCloseTo(8.5 / 2 + 0.04, 6);
        const ax = -nz;
        const az = nx;
        expect(Math.abs(dx * ax + dz * az)).toBeLessThanOrEqual(10 + 1e-6);
      }
      // The opposite (alley) face is dressed too — the box is wrapped, not fronted.
      const alleyBands = placements.filter(
        (placement) =>
          placement.element === 'floor-band' && streetBeyond(placement.x, placement.z) < -1,
      );
      expect(alleyBands.length).toBe(streetBands.length);
      // Corner reveals flank the street face: exactly the two corners on the street side.
      const corners = placements.filter((placement) => placement.element === 'corner-reveal');
      expect(corners.length).toBe(4);
      const streetCorners = corners.filter((corner) => streetBeyond(corner.x, corner.z) > 1);
      expect(streetCorners.length).toBe(2);
    });
  });

  it('masses set-back frontage shells: the rhythm kit follows both volumes', () => {
    // Phase 8.3e regression guard: a frontage with a 2 m street-face inset — the bands,
    // crown cladding, masts and shopfronts must follow the two volumes, not the old box.
    const building: FacadeKitBuildingRef = {
      kind: 'frontage',
      x: 0,
      z: 0,
      width: 8.5,
      depth: 20,
      height: 14,
      roofStyle: 'flat',
      yaw: 0,
      frontage: true,
      massing: { baseHeight: 8.2, insets: [2.0, 0, 0, 0] },
    };
    const placements = generateFacadeKitPlacements('A', [building], []);
    // Podium street-face bands (full box line + 0.04 m) stop at the step.
    const streetBands = placements.filter(
      (placement) => placement.element === 'floor-band' && placement.x > 4.0,
    );
    expect(streetBands.length).toBeGreaterThanOrEqual(2);
    for (const band of streetBands) {
      expect(band.x).toBeCloseTo(8.5 / 2 + 0.04, 6);
      expect(band.y - FACADE_KIT_BASE_Y).toBeLessThanOrEqual(8.2 + 0.14 + 1e-6);
    }
    // Upper-volume street-face bands (inset face line + 0.04 m) start at the step.
    const upperStreetBands = placements.filter(
      (placement) => placement.element === 'floor-band' && placement.x > 1.5 && placement.x < 3.0,
    );
    expect(upperStreetBands.length).toBeGreaterThanOrEqual(1);
    for (const band of upperStreetBands) {
      expect(band.x).toBeCloseTo(8.5 / 2 - 2.0 + 0.04, 6);
      expect(band.y - FACADE_KIT_BASE_Y).toBeGreaterThanOrEqual(8.2 - 0.14 - 1e-6);
    }
    // The alley face (no inset) is dressed base to roof.
    const alleyBands = placements.filter(
      (placement) => placement.element === 'floor-band' && placement.x < -4.0,
    );
    expect(alleyBands.length).toBeGreaterThanOrEqual(streetBands.length);
    // The crown cladding: the street crown sits on the inset face, the alley crown on the box.
    const crowns = placements.filter((placement) => placement.element === 'crown-cladding');
    expect(crowns.length).toBe(4);
    const streetCrowns = crowns.filter((crown) => crown.x > 0);
    expect(streetCrowns.length).toBe(1);
    expect(streetCrowns[0]!.x).toBeCloseTo(8.5 / 2 - 2.0, 6);
    expect(crowns.find((crown) => crown.x < -4)!.x).toBeCloseTo(-8.5 / 2, 6);
    // The corner pilasters follow the podium, not the old full box.
    const corners = placements.filter((placement) => placement.element === 'corner-reveal');
    expect(corners.length).toBe(4);
    for (const corner of corners) {
      expect(corner.scale[1]).toBeCloseTo(8.3, 6);
    }
    // Masts stand on the upper volume's roof when present.
    for (const mast of placements.filter((placement) => placement.element === 'mast')) {
      expect(Math.abs(mast.x + 1.0)).toBeLessThanOrEqual(6.5 * 0.15 + 1e-6);
      expect(Math.abs(mast.z)).toBeLessThanOrEqual(20 * 0.15 + 1e-6);
    }
    // The shopfront row stays on the podium street face (full box line + 0.13 m).
    const storefronts = placements.filter(
      (placement) => placement.element === 'storefront-glazing',
    );
    expect(storefronts.length).toBeGreaterThanOrEqual(3);
    for (const storefront of storefronts) {
      expect(storefront.x).toBeCloseTo(8.5 / 2 + 0.13, 6);
    }
  });

  it('keeps balconies on the volume they sit on when the shell is set back', () => {
    // Phase 8.3f regression guard: an infill shell (residential, local +Z front) with a
    // podium base and front/back insets — slabs below the step stay on the box face, slabs
    // above the step sit on the set-back upper face instead of floating over the terrace.
    const building: FacadeKitBuildingRef = {
      kind: 'infill',
      x: 0,
      z: 0,
      width: 14,
      depth: 11,
      height: 10.5,
      roofStyle: 'flat',
      yaw: 0,
      massing: { baseHeight: 5.6, insets: [0, 0, 1.4, 0.8] },
    };
    const placements = generateFacadeKitPlacements('A', [building], []);
    const balconies = placements.filter((placement) => placement.element === 'balcony');
    expect(balconies.length).toBe(3);
    const atFloor = (floorY: number): FacadeKitPlacement => {
      const slab = balconies.find(
        (placement) => Math.abs(placement.y - FACADE_KIT_BASE_Y - floorY) < 1e-9,
      );
      expect(slab, `missing balcony slab at ${floorY} m`).toBeDefined();
      return slab!;
    };
    // 2.85 m slab: below the 5.6 m step → full box face (+0.4 m protrude).
    expect(atFloor(2.85).z).toBeCloseTo(11 / 2 + 0.4, 6);
    // 5.7 m and 8.55 m slabs: above the step → the set-back upper face. Upper centre sits at
    // local z = (−Z inset − +Z inset)/2 = (0.8 − 1.4)/2 = −0.3, upper depth 11 − 1.4 − 0.8 =
    // 8.8 → face at −0.3 + 4.4 + 0.4.
    expect(atFloor(5.7).z).toBeCloseTo(4.5, 6);
    expect(atFloor(8.55).z).toBeCloseTo(4.5, 6);
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
    // Phase 8.3d: masts stand on the flat roofs (45% roll) plus every tower.
    expect(num(a, 'facadeKitMasts')).toBeGreaterThanOrEqual(Math.floor(shells * 0.2));
    // Shopfront rows are tier-independent: every shell gets at least one glazing unit.
    expect(num(a, 'facadeKitStorefrontGlazing')).toBeGreaterThanOrEqual(shells);
    expect(num(c, 'facadeKitStorefrontGlazing')).toBe(num(a, 'facadeKitStorefrontGlazing'));
    // Ground-floor commerce: every shop keeps a canopy, plus a large share of frontages.
    expect(num(a, 'facadeKitAwnings')).toBeGreaterThanOrEqual(num(a, 'shops'));
    expect(num(a, 'facadeKitAwnings')).toBeGreaterThanOrEqual(Math.floor(shells * 0.1));
    // Both glass bands survive on every high-rise.
    expect(num(a, 'facadeKitGlassBands')).toBe(num(a, 'highRiseBuildings') * 2);
    // Phase 8.3b: every street-facing shell gets a dark base and a parapet crown, and the
    // facade window grid is dense enough to read as architecture (Phase 8.3d moved the rows
    // above the shopfronts; pool ≈ 20k candidates, tier A keeps 14.4k of them).
    expect(num(a, 'facadeKitGroundCladding')).toBeGreaterThanOrEqual(shells);
    expect(num(a, 'facadeKitCrownCladding')).toBeGreaterThanOrEqual(shells);
    expect(num(a, 'facadeWindowInstances')).toBeGreaterThanOrEqual(12_000);
    // Strict density ordering on the real district.
    expect(num(b, 'facadeKitBalconies')).toBeGreaterThan(num(c, 'facadeKitBalconies'));
    expect(num(a, 'facadeKitBalconies')).toBeGreaterThan(num(b, 'facadeKitBalconies'));
    expect(num(b, 'facadeKitFloorBands')).toBeGreaterThan(num(c, 'facadeKitFloorBands'));
    expect(num(a, 'facadeKitFloorBands')).toBeGreaterThan(num(b, 'facadeKitFloorBands'));
    expect(num(b, 'facadeKitCornerReveals')).toBeGreaterThan(num(c, 'facadeKitCornerReveals'));
    expect(num(a, 'facadeKitCornerReveals')).toBeGreaterThan(num(b, 'facadeKitCornerReveals'));
    expect(num(b, 'facadeKitMasts')).toBeGreaterThanOrEqual(num(c, 'facadeKitMasts'));
    expect(num(a, 'facadeKitMasts')).toBeGreaterThanOrEqual(num(b, 'facadeKitMasts'));
    expect(num(b, 'facadeKitGroundCladding')).toBeGreaterThan(num(c, 'facadeKitGroundCladding'));
    expect(num(a, 'facadeKitGroundCladding')).toBeGreaterThan(num(b, 'facadeKitGroundCladding'));
    expect(num(b, 'facadeKitCrownCladding')).toBeGreaterThan(num(c, 'facadeKitCrownCladding'));
    expect(num(a, 'facadeKitCrownCladding')).toBeGreaterThan(num(b, 'facadeKitCrownCladding'));
  });
});
