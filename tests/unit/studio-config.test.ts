import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONFIG,
  SURFACE_MATERIALS,
  framingDistance,
  gridCentre,
  gridRows,
  gridSlotPosition,
  materialFocusPose,
  studioCameraPose,
} from '../../src/config/studio';

/**
 * The studio's layout and material values are pure data and pure geometry, so everything that
 * decides whether the rig is *usable* can be asserted without a GPU: that the whole grid fits in
 * frame, that every material stands on the floor, that the grid clears the control panel, and that
 * the materials themselves are physically plausible.
 *
 * These are checks against a rig that renders but is wrong in a way no screenshot review catches —
 * a sphere hovering a metre above the floor looks fine until you notice its shadow is nowhere near
 * it, and a grid that runs off the edge of the frame looks like a framing preference rather than a
 * bug.
 */
const MATERIAL_COUNT = SURFACE_MATERIALS.length;
const ASPECT = 16 / 9;
const FOV = STUDIO_CONFIG.camera.fov;

/** Visible world width and height at a given distance, for the studio's lens. */
function visibleExtent(distance: number, aspect: number, fovDegrees: number) {
  const vertical = (fovDegrees * Math.PI) / 180;
  const height = 2 * distance * Math.tan(vertical / 2);
  return { width: height * aspect, height };
}

describe('studio grid layout', () => {
  it('places every material left to right within a row, with rows receding from the camera', () => {
    const first = gridSlotPosition(0);
    const second = gridSlotPosition(1);
    const nextRow = gridSlotPosition(STUDIO_CONFIG.columns);

    expect(second.x).toBeGreaterThan(first.x);
    // The camera stands on +Z, so the second row must be *further away*, not nearer.
    expect(nextRow.z).toBeLessThan(first.z);
    // `toBeCloseTo` rather than `toBe`: the front row computes `-0`, which is not `Object.is(0)`.
    expect(gridSlotPosition(0).z).toBeCloseTo(0, 6);
  });

  it('stands every sphere on the floor rather than in the air', () => {
    // The whole point of the floor is the contact shadow; a floating sphere puts its shadow metres
    // away and the contact judgement is lost.
    expect(STUDIO_CONFIG.gridHeight).toBeCloseTo(STUDIO_CONFIG.sphereRadius, 6);
  });

  it('fits the material set in a grid that is wider than it is deep', () => {
    const rows = gridRows(MATERIAL_COUNT, STUDIO_CONFIG);
    expect(rows).toBeLessThanOrEqual(2);
    // Looking down a grid compresses the back rows into the front ones, so more columns than rows
    // is what keeps every material visible.
    expect(STUDIO_CONFIG.columns).toBeGreaterThanOrEqual(rows);
  });

  it('centres the grid on the extents it actually occupies', () => {
    const columns = Math.min(MATERIAL_COUNT, STUDIO_CONFIG.columns);
    const rows = gridRows(MATERIAL_COUNT, STUDIO_CONFIG);
    const centre = gridCentre(MATERIAL_COUNT, STUDIO_CONFIG);
    const first = gridSlotPosition(0);
    const lastX = gridSlotPosition(columns - 1);
    const lastZ = gridSlotPosition((rows - 1) * STUDIO_CONFIG.columns);

    expect(centre.x).toBeCloseTo((first.x + lastX.x) / 2, 6);
    expect(centre.z).toBeCloseTo((first.z + lastZ.z) / 2, 6);
    expect(centre.y).toBeCloseTo(STUDIO_CONFIG.gridHeight, 6);
  });
});

describe('studio framing', () => {
  it('frames the whole grid, in both width and depth, for the studio lens', () => {
    const distance = framingDistance(MATERIAL_COUNT, ASPECT, FOV);
    const visible = visibleExtent(distance, ASPECT, FOV);
    const gridWidth = Math.min(MATERIAL_COUNT, STUDIO_CONFIG.columns) * STUDIO_CONFIG.spacing;
    const gridDepth = gridRows(MATERIAL_COUNT, STUDIO_CONFIG) * STUDIO_CONFIG.spacing;

    // Width is the obvious constraint; the depth one is the trap, because looking down at an angle
    // projects the grid's depth into a vertical screen extent that a width-only calculation ignores.
    expect(visible.width).toBeGreaterThan(gridWidth);
    const projectedDepth =
      gridDepth * Math.sin((STUDIO_CONFIG.camera.elevationDegrees * Math.PI) / 180) +
      STUDIO_CONFIG.sphereRadius * 2;
    expect(visible.height).toBeGreaterThan(projectedDepth);
  });

  it('stands the camera above the grid, in front of it, looking down at it', () => {
    const pose = studioCameraPose(MATERIAL_COUNT, ASPECT, FOV, STUDIO_CONFIG);
    const centre = gridCentre(MATERIAL_COUNT, STUDIO_CONFIG);

    expect(pose.position[1]).toBeGreaterThan(centre.y);
    expect(pose.position[2]).toBeGreaterThan(centre.z);
    expect(pose.target).toEqual([pose.target[0], centre.y, centre.z]);
  });

  it('backs off and slides across when the control panel covers part of the frame', () => {
    const clear = studioCameraPose(MATERIAL_COUNT, ASPECT, FOV, STUDIO_CONFIG, 0);
    const covered = studioCameraPose(MATERIAL_COUNT, ASPECT, FOV, STUDIO_CONFIG, 0.22);

    // Backing off makes the grid smaller; sliding left moves it out from under the panel, which
    // stands on the left of the frame.
    expect(covered.position[2]).toBeGreaterThan(clear.position[2]);
    expect(covered.position[0]).toBeLessThan(clear.position[0]);
    // The whole rig translates, so the camera still looks straight at the grid's centre.
    expect(covered.position[0] - covered.target[0]).toBeCloseTo(
      clear.position[0] - clear.target[0],
      6,
    );
  });

  it('keeps the framed grid inside the area the panel leaves free', () => {
    // The invariant that matters: after the correction, the grid's width still fits inside the
    // visible width of the *free* part of the frame.
    const occluded = 0.22;
    const free = 1 - occluded;
    const pose = studioCameraPose(MATERIAL_COUNT, ASPECT, FOV, STUDIO_CONFIG, occluded);
    const distance = pose.position[2] - pose.target[2];
    const visible = visibleExtent(distance, ASPECT, FOV);
    const gridWidth = Math.min(MATERIAL_COUNT, STUDIO_CONFIG.columns) * STUDIO_CONFIG.spacing;

    expect(gridWidth).toBeLessThanOrEqual(visible.width * free);
  });

  it('fills the close-up with the focused sphere, leaving its neighbours in frame', () => {
    const pose = materialFocusPose(4, FOV, STUDIO_CONFIG);
    const distance = pose.position[2] - pose.target[2];
    const visible = visibleExtent(distance, ASPECT, FOV);
    const sphereDiameter = STUDIO_CONFIG.sphereRadius * 2;

    expect(sphereDiameter / visible.height).toBeCloseTo(STUDIO_CONFIG.camera.focusFillFraction, 3);
    expect(STUDIO_CONFIG.camera.focusFillFraction).toBeGreaterThan(0.2);
    expect(STUDIO_CONFIG.camera.focusFillFraction).toBeLessThan(0.6);
    // Neighbouring spheres are one gap apart, so two gaps must still be visible on each side.
    expect(visible.width).toBeGreaterThan(STUDIO_CONFIG.spacing * 2);
  });

  it('frames a wider grid from further back', () => {
    const wide = framingDistance(MATERIAL_COUNT, ASPECT, FOV);
    const alsoWide = framingDistance(MATERIAL_COUNT, 1, FOV);
    // A square viewport has a narrower horizontal field of view than a wide one, so it needs more
    // distance for the same grid.
    expect(alsoWide).toBeGreaterThan(wide);
  });
});

describe('studio material set', () => {
  it('gives every material a unique id, a label, and a note', () => {
    const ids = SURFACE_MATERIALS.map((material) => material.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const material of SURFACE_MATERIALS) {
      expect(material.label.length).toBeGreaterThan(0);
      expect(material.note.length).toBeGreaterThan(0);
    }
  });

  it('keeps every value inside the range the renderer accepts', () => {
    for (const material of SURFACE_MATERIALS) {
      expect(Number.isInteger(material.color)).toBe(true);
      expect(material.color).toBeGreaterThanOrEqual(0);
      expect(material.color).toBeLessThanOrEqual(0xffffff);
      expect(material.metalness).toBeGreaterThanOrEqual(0);
      expect(material.metalness).toBeLessThanOrEqual(1);
      expect(material.roughness).toBeGreaterThan(0);
      expect(material.roughness).toBeLessThanOrEqual(1);
      for (const value of [material.clearcoat, material.clearcoatRoughness]) {
        if (value !== undefined) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
      if (material.transmission !== undefined) {
        expect(material.transmission).toBeGreaterThan(0);
        expect(material.transmission).toBeLessThanOrEqual(1);
      }
      if (material.ior !== undefined) {
        // Below air (1) is not a material, and above ~3 is not a plausible one either.
        expect(material.ior).toBeGreaterThan(1);
        expect(material.ior).toBeLessThan(3);
      }
    }
  });

  it('tests the pairs that are actually hard to tell apart', () => {
    const byId = new Map(SURFACE_MATERIALS.map((material) => [material.id, material]));

    // Metals are metal and dielectrics are not: half-metals are the classic authoring mistake.
    expect(byId.get('chrome')?.metalness).toBe(1);
    expect(byId.get('aluminium')?.metalness).toBe(1);
    for (const id of ['asphalt', 'gravel', 'soil', 'grass', 'snow', 'rubber']) {
      expect(byId.get(id)?.metalness).toBe(0);
    }
    // Roughness has to span a useful range or the grid teaches nothing: a mirror, a satin, and a
    // near-matte must all be present.
    expect(byId.get('chrome')?.roughness).toBeLessThan(0.1);
    expect(byId.get('paint-solid')?.roughness).toBeGreaterThan(byId.get('chrome')!.roughness);
    expect(byId.get('gravel')?.roughness).toBeGreaterThan(0.8);

    // Glass and water are refractive, with water's index below glass's.
    expect(byId.get('glass')?.transmission).toBe(1);
    expect(byId.get('glass')?.ior).toBeCloseTo(1.52, 2);
    expect(byId.get('water')?.ior).toBeCloseTo(1.33, 2);
    expect(byId.get('water')!.ior!).toBeLessThan(byId.get('glass')!.ior!);

    // The three paints share a purpose but differ in finish, which is the comparison the top row
    // exists to make.
    const paints = ['paint-solid', 'paint-metallic', 'paint-matte'].map((id) => byId.get(id)!);
    expect(paints.every((paint) => paint.clearcoat !== undefined)).toBe(true);
    expect(paints[2]!.roughness).toBeGreaterThan(paints[0]!.roughness);

    // Snow is bright but not blown out; asphalt is dark but not black.
    expect(byId.get('snow')!.color).toBeLessThan(0xffffff);
    expect(byId.get('snow')!.color).toBeGreaterThan(0xc0c0c0);
    expect(byId.get('asphalt')!.color).toBeLessThan(0x505050);
    expect(byId.get('asphalt')!.color).toBeGreaterThan(0x202020);
  });

  it('reserves a slot for the scanned surface the pipeline published', () => {
    const cedar = SURFACE_MATERIALS.find((material) => material.id === 'cedar');
    expect(cedar).toBeDefined();
    // Its look comes from the maps, so the flat material underneath must not tint them.
    expect(cedar?.color).toBe(0xffffff);
    expect(cedar?.metalness).toBe(0);
  });
});
