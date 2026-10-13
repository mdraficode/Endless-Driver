/**
 * Phase 1 rendering configuration.
 *
 * All Phase 1 tuning values live here so systems stay data-driven and later quality
 * tiers can override them without touching engine/scene code. Values are deliberately
 * conservative placeholders for the scene foundation and are expected to be tuned as
 * real world content, weather, and vehicle systems arrive in later phases.
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

export interface GridConfig {
  readonly enabled: boolean;
  /** Distance between grid lines in meters. Must divide the ground size evenly. */
  readonly spacing: number;
  /** Line thickness as a multiple of one screen-space pixel of coverage. */
  readonly lineWidth: number;
  readonly lineColor: number;
  readonly centerLineColor: number;
  /** Distance in meters at which the grid fades out, preventing distant moire. */
  readonly fadeDistance: number;
  /** Peak blend strength of the grid lines over the ground albedo. */
  readonly strength: number;
}

export interface GroundConfig {
  readonly size: number;
  readonly color: number;
  readonly roughness: number;
  readonly metalness: number;
  readonly grid: GridConfig;
}

export interface ReferencePropsConfig {
  /** Temporary shadow-casting props used to verify the lighting setup. */
  readonly enabled: boolean;
  readonly castShadow: boolean;
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
  readonly ground: GroundConfig;
  readonly referenceProps: ReferencePropsConfig;
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
  ground: {
    size: 800,
    color: 0x8d97a3,
    roughness: 0.95,
    metalness: 0,
    grid: {
      enabled: true,
      spacing: 5,
      lineWidth: 1.25,
      lineColor: 0x5b6672,
      centerLineColor: 0x77828f,
      fadeDistance: 240,
      strength: 0.6,
    },
  },
  referenceProps: {
    enabled: true,
    castShadow: true,
  },
  diagnostics: {
    overlayEnabled: true,
    hudUpdateIntervalSeconds: 0.25,
    sampleWindow: 120,
    exposeDebugHandle: true,
  },
};
