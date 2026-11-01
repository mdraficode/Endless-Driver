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

function makeBuilder(): Builder {
  // Minimal renderer stub: the buffer branch only touches renderer.debug.diagnostics.keywords.
  const renderer = { debug: { diagnostics: { keywords: [] } } };
  return new GLSLNodeBuilder(new Object3D(), renderer as never) as unknown as Builder;
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
    installStableShaderBufferNames();
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
    installStableShaderBufferNames();
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
    installStableShaderBufferNames();
    const builder = makeBuilder();
    const node = makeBufferNode(8);
    const uniformNode = builder.getUniformFromNode(node, 'float', 'vertex', 'myFloat');
    expect(uniformNode.name).toBe('myFloat');
  });

  it('is idempotent and survives re-installation without double-wrapping', () => {
    installStableShaderBufferNames();
    installStableShaderBufferNames();
    expect(hasStableShaderBufferNames()).toBe(true);
    const builder = makeBuilder();
    const node = makeBufferNode(32);
    const uniformNode = builder.getUniformFromNode(node, 'buffer', 'vertex');
    expect(uniformNode.name).toBe('buffer_mat4x32');
  });
});
