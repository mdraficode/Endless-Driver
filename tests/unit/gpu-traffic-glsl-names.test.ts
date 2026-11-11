import { describe, expect, it } from 'vitest';

import { STREAMED_TRAFFIC_CLASSES } from '../../src/config/world-events';
import { toGlslIdentifier } from '../../src/world/gpu-traffic';

/**
 * Phase 12.2 follow-up — the WebGL2 backend compiles TSL node names straight
 * into GLSL: a vertex node named `GpuTraffic.streamed-traffic-…-vertex` became
 * `layout(location=N) in vec4 GpuTraffic.streamed-traffic-…-vertex;` in the
 * generated vertex shader, which is not a legal GLSL identifier (dot + dash).
 * Every traffic vehicle's shader failed to compile, so the whole streamed
 * fleet silently never rendered on WebGL2 devices (WebGPU/WGSL is
 * permissive, which is why the bug only surfaced on the WebGL2 backend).
 * These guards pin the naming contract that keeps the GLSL valid.
 */
const GLSL_IDENTIFIER = /^[a-zA-Z][a-zA-Z0-9_]*$/;

describe('toGlslIdentifier (WebGL2 traffic shader naming)', () => {
  it('maps every per-class traffic vertex node name to a valid GLSL identifier', () => {
    for (const type of STREAMED_TRAFFIC_CLASSES) {
      const name = toGlslIdentifier(`GpuTraffic.streamed-traffic-${type}-vertex`);
      expect(GLSL_IDENTIFIER.test(name), `expected GLSL identifier, got "${name}"`).toBe(true);
    }
  });

  it('keeps the per-class vertex node identifiers unique (no redefined in-attributes)', () => {
    const names = STREAMED_TRAFFIC_CLASSES.map((type) =>
      toGlslIdentifier(`GpuTraffic.streamed-traffic-${type}-vertex`),
    );
    expect(new Set(names).size).toBe(STREAMED_TRAFFIC_CLASSES.length);
  });

  it('sanitizes dots, dashes and leading digits into plain identifiers', () => {
    expect(toGlslIdentifier('GpuTraffic.step')).toBe('GpuTrafficStep');
    expect(toGlslIdentifier('GpuTraffic.streamed-traffic-semi-trailer-rig-vertex')).toBe(
      'GpuTrafficStreamedTrafficSemiTrailerRigVertex',
    );
    expect(toGlslIdentifier('9lives-node')).toBe('_9livesNode');
    expect(toGlslIdentifier('12345')).toBe('_12345');
    expect(toGlslIdentifier('plainName_1')).toBe('plainName_1');
  });
});
