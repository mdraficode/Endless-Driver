/**
 * Rendering configuration: everything the renderer, camera rig, lighting, atmosphere, and HUD
 * need. World content (ground, grid, obstacles) lives in `config/world.ts` because the physics
 * world builds colliders from the same definitions.
 *
 * All values are data, never inline constants, so later quality tiers can override them without
 * touching engine or scene code.
 */
export type ShadowMapTypeName = 'pcf' | 'vsm';

export interface ShadowConfig {
  /**
   * Shadow filtering mode.
   *
   * Three.js r186 deprecated and removed `PCFSoftShadowMap` at runtime (the renderer warns and
   * silently falls back to `PCFShadowMap`), so the requested soft-shadow path is expressed as:
   * - `pcf` — filtered percentage-closer shadows (default, supported, no warnings);
   * - `vsm` — variance shadow maps for genuinely soft edges, at the cost of light bleeding.
   */
  readonly shadowMapType: ShadowMapTypeName;
  /** Only used by the `vsm` mode. */
  readonly vsmBlurSamples: number;
  /** Square shadow map resolution in pixels per side. */
  readonly mapSize: number;
  /** Half-extent of the orthographic shadow camera in meters. */
  readonly cameraBounds: number;
  readonly cameraNear: number;
  readonly cameraFar: number;
  readonly bias: number;
  readonly normalBias: number;
}

export interface CameraConfig {
  readonly fov: number;
  readonly near: number;
  readonly far: number;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly minDistance: number;
  readonly maxDistance: number;
  /** Keeps the debug camera above the horizon. */
  readonly maxPolarAngle: number;
  readonly dampingFactor: number;
}

export interface SkyConfig {
  /** Deep blue overhead. */
  readonly zenithColor: number;
  /** Pale color at the horizon and the scene background fallback. */
  readonly horizonColor: number;
  /** Color below the horizon so the dome never shows a hard seam. */
  readonly groundColor: number;
  /** Radius of the sky dome in meters. */
  readonly radius: number;
  /** Higher values concentrate the zenith color nearer the top of the dome. */
  readonly gradientExponent: number;
  readonly fogEnabled: boolean;
  readonly fogNear: number;
  readonly fogFar: number;
}

export interface LightingConfig {
  readonly ambientColor: number;
  readonly ambientIntensity: number;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly sunPosition: readonly [number, number, number];
}

export interface DiagnosticsConfig {
  readonly overlayEnabled: boolean;
  /** Seconds between HUD refreshes; keeps DOM work off the per-frame path. */
  readonly hudUpdateIntervalSeconds: number;
  /** Number of recent frames retained for FPS/frame-time statistics. */
  readonly sampleWindow: number;
  /** Master switch for the `window.__ENDLESS_DRIVER__` diagnostics handle. */
  readonly exposeDebugHandle: boolean;
}

export interface RenderConfig {
  /** Hard cap on devicePixelRatio; mobile GPUs must not render at 3x/4x. */
  readonly maxPixelRatio: number;
  /** Upper bound for a single frame delta so tab-switch stalls cannot teleport state. */
  readonly maxFrameDeltaSeconds: number;
  readonly camera: CameraConfig;
  readonly shadows: ShadowConfig;
  readonly sky: SkyConfig;
  readonly lighting: LightingConfig;
  readonly diagnostics: DiagnosticsConfig;
}

export const RENDER_CONFIG: RenderConfig = {
  maxPixelRatio: 2,
  maxFrameDeltaSeconds: 0.1,
  camera: {
    fov: 60,
    near: 0.1,
    far: 2000,
    position: [26, 12, 34],
    target: [0, 1.5, 0],
    minDistance: 4,
    maxDistance: 400,
    maxPolarAngle: Math.PI / 2 - 0.02,
    dampingFactor: 0.08,
  },
  shadows: {
    shadowMapType: 'pcf',
    vsmBlurSamples: 8,
    mapSize: 2048,
    cameraBounds: 70,
    cameraNear: 1,
    cameraFar: 320,
    bias: -0.0004,
    normalBias: 0.02,
  },
  sky: {
    zenithColor: 0x1257a8,
    horizonColor: 0x9ec6ea,
    groundColor: 0x5d6a78,
    radius: 900,
    gradientExponent: 0.55,
    fogEnabled: true,
    fogNear: 140,
    fogFar: 760,
  },
  lighting: {
    ambientColor: 0xa8c2de,
    ambientIntensity: 0.9,
    sunColor: 0xfff2dd,
    sunIntensity: 2.4,
    sunPosition: [70, 95, 55],
  },
  diagnostics: {
    overlayEnabled: true,
    hudUpdateIntervalSeconds: 0.25,
    sampleWindow: 120,
    exposeDebugHandle: true,
  },
};
