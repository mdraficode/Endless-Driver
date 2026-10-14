/**
 * Geometry helpers for the model pipeline.
 *
 * The reason this module exists is one measured behaviour: meshoptimizer's simplifier works on
 * *topology*, and a mesh whose UV or normal seams have duplicated every vertex has almost no edges
 * left to collapse. On the first real prop through this pipeline — a 1K scanned boulder — that
 * looked like a hard floor at 82% of the source triangles, no matter how loose the error budget was
 * set (ratios of 0.4, 0.2, even 0.05 all returned the same 54k triangles). Merging the duplicated
 * positions first let the same call hit its ratio target exactly, at 0.13% error.
 *
 * So seam merging is the lever that makes simplification work at all. It is applied deliberately,
 * and not everywhere: see `MODEL_LOD_RATIOS` for which levels merge and why.
 */
import { compactPrimitive } from '@gltf-transform/functions';

/**
 * Reads a position component, whatever its storage type.
 *
 * Source models arrive in whatever the archive shipped — this one is float32, but a quantized source
 * would be Int16 with a scale, and reading the raw typed array would silently produce garbage
 * distances. `getElement()` handles the conversion.
 */
function readPosition(attribute, index, target) {
  const array = attribute.getArray();
  if (array instanceof Float32Array) {
    target[0] = array[index * 3];
    target[1] = array[index * 3 + 1];
    target[2] = array[index * 3 + 2];
    return target;
  }
  attribute.getElement(index, target);
  return target;
}

/**
 * Merges vertices that share a position, keeping the first occurrence's other attributes.
 *
 * Merging positions — rather than merging whole vertices, which is what `weld()` does — is what
 * reconnects the triangles either side of a UV or normal seam into one surface. The seam's attribute
 * values are not averaged or discarded: the surviving vertex keeps the values of whichever copy
 * appeared first, so the mesh keeps a coherent set of attributes and loses only the *duplication*.
 * For a deep level of detail, viewed at distance, that is the right trade; for the closest level it
 * is not, which is why the caller decides per level.
 *
 * Returns the vertex counts either side of the merge, so the caller can log what it saved.
 */
export function mergePositionSeams(primitive, options = {}) {
  const tolerance = options.tolerance ?? 0;
  const position = primitive.getAttribute('POSITION');
  const indices = primitive.getIndices();
  if (!position || !indices) {
    return { before: position?.getCount() ?? 0, after: position?.getCount() ?? 0, removed: 0 };
  }

  const count = position.getCount();
  const source = indices.getArray();
  const scratch = [0, 0, 0];
  const seen = new Map();
  const remap = new Uint32Array(count);
  let kept = 0;

  const keyOf = (index) => {
    readPosition(position, index, scratch);
    // Quantizing by the tolerance is what makes the merge tolerant of float noise; at the default
    // tolerance of zero the raw values are the key, which merges exactly-duplicated positions.
    return tolerance > 0
      ? `${Math.round(scratch[0] / tolerance)},${Math.round(scratch[1] / tolerance)},${Math.round(scratch[2] / tolerance)}`
      : `${scratch[0]},${scratch[1]},${scratch[2]}`;
  };

  // The scan follows the *index buffer*, numbering each newly seen position in order of first use.
  // Two details in this loop are contract, not style, and both were found the hard way — by getting
  // them wrong and producing a mesh that still had the right triangle count and no error message:
  //
  // - Only vertices the index buffer references get a number. Sweeping every position instead
  //   numbers vertices no triangle uses, which leaves a partly empty position array — and an
  //   empty slot is a vertex sitting at the origin, which drags the bounding box to the origin and
  //   changes the scale the simplifier measures its error against.
  // - The numbering must be what `compactPrimitive` expects: a dense map from source vertex to
  //   destination vertex, with no gaps, so that it can allocate destination arrays of exactly the
  //   right size and rewrite every attribute against it.
  for (let i = 0; i < source.length; i += 1) {
    const vertex = source[i];
    const key = keyOf(vertex);
    let destination = seen.get(key);
    if (destination === undefined) {
      destination = kept;
      seen.set(key, destination);
      kept += 1;
    }
    remap[vertex] = destination;
  }

  if (kept === count) {
    return { before: count, after: count, removed: 0 };
  }

  // `compactPrimitive` rewrites the index buffer itself, from the indices it finds on the way in.
  // Rewriting them here first makes it apply the remap a second time, against a table keyed by
  // source vertex rather than by destination index — which produces a mesh of the right size, with
  // the right triangle count, and quietly wrong attributes.
  compactPrimitive(primitive, remap, kept);

  return {
    before: count,
    after: primitive.getAttribute('POSITION').getCount(),
    removed: count - kept,
  };
}

/**
 * Copies one accessor into another document, with its own copy of the data.
 *
 * The data is copied rather than referenced because the destination document owns it from here on:
 * quantization rewrites these arrays in place, and a shared buffer would silently rewrite the
 * source document too.
 */
function copyAccessor(accessor, document) {
  const array = accessor.getArray();
  // The component type is a consequence of the array's type here, and bounds are derived from the
  // data, so copying those is a matter of handing over the right array — not of restating them.
  return document
    .createAccessor(accessor.getName())
    .setType(accessor.getType())
    .setNormalized(accessor.getNormalized())
    .setArray(array ? array.slice() : array);
}

/**
 * Copies a primitive's geometry into a document, wiring it to a material that already exists there.
 *
 * This exists because `mesh.clone()` is far shallower than it looks: the clone shares its
 * primitives, its accessors *and* their underlying typed arrays with the original. Simplifying a
 * cloned mesh in place therefore rewrites the mesh it was cloned from — which is how the first
 * version of this pipeline quietly corrupted its own closest level of detail while appearing to
 * produce three distinct ones. Copying explicitly is the only version of this that is honest.
 *
 * Textures are deliberately not copied: geometry never references them, and the destination already
 * owns the single shared texture set.
 */
export function copyPrimitiveInto(primitive, document, material) {
  const copy = document.createPrimitive();
  for (const semantic of primitive.listSemantics()) {
    copy.setAttribute(semantic, copyAccessor(primitive.getAttribute(semantic), document));
  }
  const indices = primitive.getIndices();
  if (indices) {
    copy.setIndices(copyAccessor(indices, document));
  }
  if (material) {
    copy.setMaterial(material);
  }
  return copy;
}

/** Triangles in one mesh, counted across its primitives. */
export function countMeshTriangles(mesh) {
  let triangles = 0;
  for (const primitive of mesh.listPrimitives()) {
    const indices = primitive.getIndices();
    const position = primitive.getAttribute('POSITION');
    const count = indices ? indices.getCount() : (position?.getCount() ?? 0);
    triangles += Math.floor(count / 3);
  }
  return triangles;
}
