import { Color, Vector3 } from 'three';
import { cameraPosition, fwidth, mix, positionWorld, smoothstep, uniform, vec2 } from 'three/tsl';
import type { GroundConfig } from '../config/world';

/**
 * Node material fragments for the world surface.
 *
 * ADR 0004 keeps all custom shading in TSL: `ShaderMaterial`, `RawShaderMaterial`, and
 * `onBeforeCompile` patches only exist on the WebGL backend, so using them would fork the rendering
 * path between WebGPU and the WebGL2 fallback. `npm run guard:glsl` fails the build if one returns.
 */

/**
 * Hex to a linear RGB vector.
 *
 * `Color` applies the sRGB decode in its constructor, so the result is already in the renderer's
 * working colour space and must not be decoded again.
 */
export function linearColor(hex: number): Vector3 {
  const color = new Color(hex);
  return new Vector3(color.r, color.g, color.b);
}

/**
 * Dashed reference grid drawn inside the ground material instead of as separate coplanar geometry.
 *
 * A `GridHelper` a centimetre above an 800 m plane z-fights badly: at that scale the depth buffer
 * cannot resolve two nearly coincident surfaces, so distant lines dissolve and the surface visibly
 * flickers. Deriving analytically anti-aliased lines from the world position keeps the plane a single
 * surface, respects the PBR lighting and shadows, and fades out before the lines alias at distance.
 *
 * The line width is measured in screen-space derivatives of the world position, which is why this
 * cannot be a texture: the lines stay one pixel wide no matter how far the camera is.
 *
 * Phase 4 replaces this with authored roads and terrain splatting; it is a reference surface, not
 * world content.
 */
export function createGroundGridColorNode(ground: GroundConfig) {
  const { grid } = ground;
  const baseColor = uniform(linearColor(ground.color));
  const lineColor = new Color(grid.lineColor);
  const centerColor = new Color(grid.centerLineColor);
  const lineColorNode = uniform(new Vector3(lineColor.r, lineColor.g, lineColor.b));
  const centerColorNode = uniform(new Vector3(centerColor.r, centerColor.g, centerColor.b));
  const spacing = uniform(grid.spacing);
  const lineWidth = uniform(grid.lineWidth);
  const fadeDistance = uniform(grid.fadeDistance);
  const strength = uniform(grid.strength);

  const planeCoord = positionWorld.xz;
  const coord = planeCoord.div(spacing);

  // Distance to the nearest grid line, measured in fractions of a pixel.
  const derivative = fwidth(coord).max(vec2(1e-5, 1e-5));
  const distanceToLine = coord.sub(0.5).fract().sub(0.5).abs().div(derivative);
  const line = distanceToLine.x.min(distanceToLine.y);
  const gridMask = line.div(lineWidth).min(1).oneMinus();

  // The two axes stay visible when the grid is zoomed out; they read as the origin crosshair.
  const axisDerivative = fwidth(planeCoord).max(vec2(1e-5, 1e-5));
  const axisDistance = planeCoord.abs().div(axisDerivative.mul(lineWidth).mul(3));
  const axisMask = axisDistance.x.min(axisDistance.y).min(1).oneMinus();

  const visibility = smoothstep(
    fadeDistance.mul(0.5),
    fadeDistance,
    positionWorld.sub(cameraPosition).length(),
  ).oneMinus();

  const blendedLineColor = mix(lineColorNode, centerColorNode, axisMask);
  const blend = gridMask.max(axisMask).mul(strength).mul(visibility);
  return mix(baseColor, blendedLineColor, blend);
}
