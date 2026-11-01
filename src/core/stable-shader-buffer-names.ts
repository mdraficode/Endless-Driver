/**
 * Deterministic names for per-instance uniform buffers in generated GLSL (WebGL2/TSL path).
 *
 * Three.js r186 emits per-instance data (InstancedMesh matrices) as uniform buffers and names
 * them from the *node id*: `uniform NodeBuffer_<node.id> { mat4 buffer<node.id>[N]; }`. The node
 * id is a process-wide counter, so every InstancedMesh — even with an identical material,
 * geometry and instance count — generates a unique shader code string. The renderer caches
 * programs by code string, so the duplicates are never collapsed. Measured on the owner's
 * phone (tier C, build DYYV3vdQ): 12 pedestrian-actor meshes with byte-identical code except
 * the buffer name produced 12 separate vertex programs; 10 traffic meshes produced 10; the 85
 * shadow-casters produced 85 vertex programs. At ~17.7 µs/KB of generated code on that device,
 * the duplication is worth several seconds of the 81 s compile stage.
 *
 * The fix: rewrite the buffer names to be derived from the buffer's element type and element
 * count (e.g. `buffer_mat4x16`). Two render objects whose instance buffers have the same
 * (type, count) then generate byte-identical code and share one compiled program; the per-object
 * data still flows through per-object bindings, so rendering is unchanged.
 *
 * A per-build collision guard keeps the id-based names (unique by construction) when the same
 * (type, count) appears more than once inside a single shader, so a name can never alias two
 * different bindings.
 *
 * The patch is applied to `GLSLNodeBuilder.prototype.getUniformFromNode` (the one method that
 * writes both names, on every visit, before code generation reads them) and is idempotent.
 */
import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js';

type BufferNodeLike = {
  isBufferNode?: boolean;
  bufferType?: string;
  bufferCount?: number;
  name?: string;
  id?: number;
};

type UniformNodeLike = { name?: string };

let installed = false;

/**
 * Derives the stable name for a buffer node, or null when the node has no usable
 * (type, count) pair and the id-based name must be kept.
 */
function stableBufferName(node: BufferNodeLike): string | null {
  if (!node || node.isBufferNode !== true) return null;
  const type = node.bufferType;
  const count = node.bufferCount;
  if (typeof type !== 'string' || type.length === 0) return null;
  if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) return null;
  return `${type}x${count}`;
}

/**
 * Installs the deterministic buffer-name patch on the WebGL2 (TSL) node builder. Safe to call
 * multiple times; only the first call patches the prototype.
 */
export function installStableShaderBufferNames(): void {
  if (installed) return;
  installed = true;

  const prototype = GLSLNodeBuilder.prototype as unknown as {
    getUniformFromNode(
      this: unknown,
      node: unknown,
      type: string,
      ...rest: unknown[]
    ): UniformNodeLike;
  };
  const original = prototype.getUniformFromNode;
  prototype.getUniformFromNode = function (
    this: Record<PropertyKey, unknown>,
    node: unknown,
    type: string,
    ...rest: unknown[]
  ): UniformNodeLike {
    const uniformNode = original.call(this, node, type, ...rest);
    if (type !== 'buffer') return uniformNode;
    const stable = stableBufferName(node as BufferNodeLike);
    if (stable === null) return uniformNode;
    const seen =
      (this.__stableShaderBufferCounts as Record<string, number> | undefined) ??
      (Object.create(null) as Record<string, number>);
    this.__stableShaderBufferCounts = seen;
    const ordinal = seen[stable] ?? 0;
    seen[stable] = ordinal + 1;
    if (ordinal > 0) return uniformNode; // duplicate (type, count) in this shader: keep unique id names
    uniformNode.name = `buffer_${stable}`;
    (node as BufferNodeLike).name = `NodeBuffer_${stable}`;
    return uniformNode;
  };
}

/** True once the patch is active (used by diagnostics/tests). */
export function hasStableShaderBufferNames(): boolean {
  return installed;
}
