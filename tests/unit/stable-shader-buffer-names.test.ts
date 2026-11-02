import { beforeAll, describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js';
import { buffer } from 'three/src/nodes/TSL.js';
import {
  hasStableShaderBufferNames,
  installStableShaderBufferNames,
} from '../../src/core/stable-shader-buffer-names';

/**
 * Exercises the real `GLSLNodeBuilder.getUniformFromNode` buffer branch (the code path that
 * names per-instance uniform buffers in generated GLSL) with a bare builder instance, so the
 * deterministic-name patch is verified against three's actual implementation, not a mock.
 */

type Builder = {
  getUniformFromNode(
    node: unknown,
    type: string,
    shaderStage?: string,
    name?: string | null,
  ): { name?: string };
};

const rendererStub = { debug: { diagnostics: { keywords: [] } } };

/** Backend stand-in whose `createNodeBuilder` returns the real builder class, mirroring how
 * the production install discovers the class from the live backend. */
function makeBackendLike(): { createNodeBuilder(object: unknown, renderer: unknown): unknown } {
  return {
    createNodeBuilder: (object: unknown, renderer: unknown) =>
      new GLSLNodeBuilder(object as never, renderer as never),
  };
}

function makeBuilder(): Builder {
  // Minimal renderer stub: the buffer branch only touches renderer.debug.diagnostics.keywords.
  return new GLSLNodeBuilder(new Object3D(), rendererStub as never) as unknown as Builder;
}

type NamedNode = { name: string };

function makeBufferNode(count: number): NamedNode {
  const node = buffer(new Float32Array(count * 16), 'mat4', count) as unknown as NamedNode & {
    groupNode: unknown;
  };
  // The builder reads `node.groupNode.name` for the bind-group key.
  node.groupNode = { name: 'render' };
  return node;
}

describe('stable-shader-buffer-names', () => {
  beforeAll(() => {
    installStableShaderBufferNames(makeBackendLike(), rendererStub);
  });

  it('rewrites buffer names to the deterministic (type, count) form', () => {
    expect(hasStableShaderBufferNames()).toBe(true);
    const builder = makeBuilder();
    const node = makeBufferNode(16);
    const uniformNode = builder.getUniformFromNode(node, 'buffer', 'vertex');
    expect(uniformNode.name).toBe('buffer_mat4x16');
    expect(node.name).toBe('NodeBuffer_mat4x16');
  });

  it('keeps unique id-based names when the same (type, count) appears twice in one build', () => {
    const builder = makeBuilder();
    const first = makeBufferNode(16);
    const second = makeBufferNode(16);
    const firstUniform = builder.getUniformFromNode(first, 'buffer', 'vertex');
    const secondUniform = builder.getUniformFromNode(second, 'buffer', 'vertex');
    expect(firstUniform.name).toBe('buffer_mat4x16');
    // The collision guard must leave the second buffer with its id-based unique name.
    expect(secondUniform.name).not.toBe('buffer_mat4x16');
    expect(secondUniform.name).toMatch(/^buffer\d+$/);
  });

  it('leaves non-buffer uniforms untouched', () => {
    const builder = makeBuilder();
    const node = makeBufferNode(8);
    const uniformNode = builder.getUniformFromNode(node, 'float', 'vertex', 'myFloat');
    expect(uniformNode.name).toBe('myFloat');
  });

  it('keeps the declaration, body reference and runtime binding names in lockstep', () => {
    const builder = makeBuilder() as Builder & {
      globalCache: unknown;
      getDataFromNode(
        node: unknown,
        stage: string,
        cache: unknown,
      ): {
        uniformGPU?: { name?: string };
      };
      getPropertyName(node: { name?: string }): string;
    };
    const node = makeBufferNode(24);
    const uniformNode = builder.getUniformFromNode(node, 'buffer', 'vertex');
    const binding = builder.getDataFromNode(node, 'vertex', builder.globalCache).uniformGPU;
    // All three names the pipeline uses must be identical, or the driver cannot resolve the
    // uniform block (getUniformBlockIndex returns -1 and the instances render as zeros).
    expect(node.name).toBe('NodeBuffer_mat4x24');
    expect(uniformNode.name).toBe('buffer_mat4x24');
    expect(binding?.name).toBe('NodeBuffer_mat4x24');
    // The body reference path (UniformNode.generate) reads getPropertyName(nodeUniform).
    expect(builder.getPropertyName(uniformNode as { name?: string })).toBe('buffer_mat4x24');
  });

  it('is a no-op when the backend exposes no createNodeBuilder', () => {
    expect(() => installStableShaderBufferNames({})).not.toThrow();
    expect(() => installStableShaderBufferNames(null)).not.toThrow();
  });

  it('is idempotent and survives re-installation without double-wrapping', () => {
    installStableShaderBufferNames(makeBackendLike(), rendererStub);
    installStableShaderBufferNames(makeBackendLike(), rendererStub);
    expect(hasStableShaderBufferNames()).toBe(true);
    const builder = makeBuilder();
    const node = makeBufferNode(32);
    const uniformNode = builder.getUniformFromNode(node, 'buffer', 'vertex');
    expect(uniformNode.name).toBe('buffer_mat4x32');
  });
});
