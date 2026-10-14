import { Document, type Mesh, type Primitive } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { countMeshTriangles, mergePositionSeams } from '../../scripts/lib/geometry.mjs';
import { MODEL_BUDGETS, MODEL_LOD_RATIOS, requireBudget } from '../../scripts/asset-budgets.mjs';
import manifest from '../../public/assets/manifest.json';

/**
 * The model pipeline's rules, tested against small meshes built here rather than against the built
 * asset.
 *
 * The built asset is a *consequence* of these rules, and asserting on it would only say that the
 * last build happened to be right. The rules themselves are what a future change is likely to break,
 * and the two that matter are both easy to get subtly wrong: where seam merging puts its vertices,
 * and whether a level of detail is actually cheaper than the level above it.
 */

/** Builds a quad split into two triangles, with the shared edge duplicated — a seam. */
function createSeamQuad(): { document: Document; mesh: Mesh; primitive: Primitive } {
  const document = new Document();
  const buffer = document.createBuffer();
  const primitive = document.createPrimitive();

  // Four corners, then the two diagonal vertices again so the triangles share no vertex — exactly
  // the shape a UV seam produces in a real asset, where one position appears twice.
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 0]);
  const indices = new Uint16Array([0, 1, 2, 3, 4, 5]);

  primitive.setAttribute(
    'POSITION',
    document.createAccessor('position').setType('VEC3').setArray(positions).setBuffer(buffer),
  );
  primitive.setAttribute(
    'TEXCOORD_0',
    document.createAccessor('uv').setType('VEC2').setArray(uvs).setBuffer(buffer),
  );
  primitive.setIndices(
    document.createAccessor('indices').setType('SCALAR').setArray(indices).setBuffer(buffer),
  );

  const mesh = document.createMesh('quad').addPrimitive(primitive);
  return { document, mesh, primitive };
}

describe('mergePositionSeams', () => {
  it('merges vertices that share a position, and keeps every triangle', () => {
    const { mesh, primitive } = createSeamQuad();
    expect(countMeshTriangles(mesh)).toBe(2);

    const result = mergePositionSeams(primitive);

    expect(result.before).toBe(6);
    expect(result.after).toBe(4);
    expect(result.removed).toBe(2);
    expect(countMeshTriangles(mesh)).toBe(2);
  });

  it('leaves an index buffer that references every vertex it keeps', () => {
    const { primitive } = createSeamQuad();
    mergePositionSeams(primitive);

    const indices = primitive.getIndices()?.getArray();
    const positions = primitive.getAttribute('POSITION')?.getArray();
    expect(indices).toBeDefined();
    expect(positions).toBeDefined();

    // A gap here is the failure this test exists for: an index past the end of the position array
    // renders as garbage and, downstream, reads past the end of the simplifier's heap.
    const highest = Math.max(...(indices as Uint32Array));
    expect(highest).toBe((positions as Float32Array).length / 3 - 1);
  });

  it('preserves the attributes of the vertex it keeps at each position', () => {
    const { primitive } = createSeamQuad();
    const uvsBefore = Array.from(primitive.getAttribute('TEXCOORD_0')?.getArray() ?? []);

    mergePositionSeams(primitive);

    const position = primitive.getAttribute('POSITION');
    const uv = primitive.getAttribute('TEXCOORD_0');
    expect(position).toBeDefined();
    expect(uv).toBeDefined();

    // Every surviving vertex must carry a UV pair that belonged to one of the vertices at that
    // position — merged vertices take the first occurrence, never an average of the two sides.
    const uvArray = Array.from(uv?.getArray() ?? []);
    for (let i = 0; i < uvArray.length; i += 2) {
      const pair = [uvArray[i], uvArray[i + 1]];
      const matches = uvsBefore.some(
        (_, index) =>
          index % 2 === 0 && uvsBefore[index] === pair[0] && uvsBefore[index + 1] === pair[1],
      );
      expect(matches).toBe(true);
    }
  });

  it('is a no-op on a mesh that has no duplicated positions', () => {
    const { primitive } = createSeamQuad();
    mergePositionSeams(primitive);
    const again = mergePositionSeams(primitive);
    expect(again.removed).toBe(0);
    expect(again.after).toBe(again.before);
  });
});

describe('model budgets', () => {
  it('defines a budget for every asset class the manifest uses', () => {
    const classes = new Set(
      manifest.assets.filter((asset) => asset.kind === 'model').map((asset) => asset.assetClass),
    );
    expect(classes.size).toBeGreaterThan(0);
    for (const assetClass of classes) {
      expect(() => requireBudget(assetClass)).not.toThrow();
    }
  });

  it('refuses to hand out a budget it does not have', () => {
    expect(() => requireBudget('no-such-class')).toThrow(/no budget is defined/);
  });

  it('saves triangles at every step of the chain', () => {
    for (const [index, ratio] of MODEL_LOD_RATIOS.entries()) {
      if (index === 0) continue;
      expect(ratio).toBeLessThan(MODEL_LOD_RATIOS[index - 1] as number);
    }
    expect(MODEL_LOD_RATIOS.at(-1)).toBeLessThan(1);
  });

  it('keeps every published model inside its budget', () => {
    const models = manifest.assets.filter((asset) => asset.kind === 'model');
    expect(models.length).toBeGreaterThan(0);

    for (const model of models) {
      const budget = requireBudget(model.assetClass);
      const lods: readonly { node: string; triangles: number }[] = model.pipeline.lods ?? [];
      expect(lods.length).toBeGreaterThanOrEqual(budget.minLods);
      expect(lods.length).toBeLessThanOrEqual(budget.maxLods);

      let previous = Number.POSITIVE_INFINITY;
      for (const lod of lods) {
        expect(lod.triangles).toBeLessThan(previous);
        previous = lod.triangles;
      }
      expect(lods[0]?.triangles ?? 0).toBeLessThanOrEqual(budget.maxTriangles);
      expect(model.files[0]?.bytes ?? 0).toBeLessThanOrEqual(budget.maxBytes);
    }
  });

  it('keeps the prop budget tight enough to be worth checking', () => {
    // A budget nobody can exceed is not a budget. These are the numbers the first prop was trimmed
    // to meet; if a change loosens them by an order of magnitude, that is worth noticing here.
    const prop = MODEL_BUDGETS.prop;
    expect(prop).toBeDefined();
    expect(prop?.maxBytes).toBeLessThanOrEqual(3_000_000);
    expect(prop?.maxTriangles).toBeLessThanOrEqual(60_000);
    expect(prop?.maxTextureSize).toBeLessThanOrEqual(1024);
  });
});
