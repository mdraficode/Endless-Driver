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
 * IMPORTANT — the patch must target the builder class the *running* renderer instantiates. The
 * app imports three from the packaged entries (`three` / `three/webgpu`), which bundle their own
 * copy of the node builder; importing `three/src/...` here would patch a second, unused class
 * (this exact mismatch shipped in D-JSQBOt and silently did nothing on the device). So the
 * class is discovered at runtime from the live backend via `createNodeBuilder`, which returns an
 * instance of the real class, and its prototype is patched.
 *
 * The patch is applied to the builder's `getUniformFromNode` (the one method that writes both
 * names, on every visit, before code generation reads them) and is idempotent.
 */

type BufferNodeLike = {
  isBufferNode?: boolean;
  bufferType?: string;
  bufferCount?: number;
  name?: string;
  id?: number;
};

type UniformNodeLike = { name?: string };

type BackendLike = {
  createNodeBuilder?: (object: unknown, renderer: unknown) => unknown;
};

/** Builder prototypes already patched (a backend swap at runtime can bring a new class). */
const patchedPrototypes: WeakSet<object> = new WeakSet();
let anyPatched = false;

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
 * Discovers the node builder class from the live backend and patches its prototype so the
 * generated per-instance UBO names are deterministic. Safe to call multiple times; only the
 * first successful call patches. No-op when the backend does not expose `createNodeBuilder`.
 */
export function installStableShaderBufferNames(backend: unknown, renderer?: unknown): void {
  const be = backend as BackendLike | null | undefined;
  if (!be || typeof be.createNodeBuilder !== 'function') return;

  // A throwaway builder instance of the exact class the renderer uses; the constructor only
  // stores references, so the probe is side-effect free and never rendered.
  const probe = be.createNodeBuilder({}, renderer ?? null);
  const prototype = Object.getPrototypeOf(probe) as {
    getUniformFromNode?: (
      this: unknown,
      node: unknown,
      type: string,
      ...rest: unknown[]
    ) => UniformNodeLike;
  } | null;
  if (!prototype || typeof prototype.getUniformFromNode !== 'function') return;
  if (patchedPrototypes.has(prototype)) return;

  patchedPrototypes.add(prototype);
  anyPatched = true;
  const original = prototype.getUniformFromNode;
  prototype.getUniformFromNode = function (
    this: unknown,
    node: unknown,
    type: string,
    ...rest: unknown[]
  ): UniformNodeLike {
    const self = this as Record<PropertyKey, unknown>;
    const uniformNode = original.call(self, node, type, ...rest);
    if (type !== 'buffer') return uniformNode;
    const stable = stableBufferName(node as BufferNodeLike);
    if (stable === null) return uniformNode;
    const seen =
      (self.__stableShaderBufferCounts as Record<string, number> | undefined) ??
      (Object.create(null) as Record<string, number>);
    self.__stableShaderBufferCounts = seen;
    const ordinal = seen[stable] ?? 0;
    seen[stable] = ordinal + 1;
    if (ordinal > 0) return uniformNode; // duplicate (type, count) in this shader: keep unique id names
    uniformNode.name = `buffer_${stable}`;
    (node as BufferNodeLike).name = `NodeBuffer_${stable}`;
    // The runtime binding lookup (WebGLBackend._setupBindings) resolves the uniform block by
    // the NodeUniformBuffer's OWN name, which the original code captured from node.name at
    // creation time — before this rename. Renaming it too is mandatory: without it the GLSL
    // declares the stable name while the lookup still uses the id name, getUniformBlockIndex
    // returns -1, the block is never bound, and every InstancedMesh renders with zero
    // matrices (this exact mismatch shipped in kHVW6972 as a black screen). The per-stage
    // binding object is cached in the node data as `uniformGPU` (the same lookup the original
    // branch uses to avoid recreating it).
    const shaderStage = (rest[0] as string | undefined) ?? 'vertex';
    const builder = self as unknown as {
      getDataFromNode?: (n: unknown, s: string, c: unknown) => { uniformGPU?: { name?: string } };
      globalCache?: unknown;
    };
    const bufferBinding = builder.getDataFromNode?.(
      node,
      shaderStage,
      builder.globalCache ?? null,
    )?.uniformGPU;
    if (bufferBinding) bufferBinding.name = `NodeBuffer_${stable}`;
    return uniformNode;
  };
}

/** True once at least one builder class is patched (used by diagnostics/tests). */
export function hasStableShaderBufferNames(): boolean {
  return anyPatched;
}
