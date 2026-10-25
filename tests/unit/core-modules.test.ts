import { describe, expect, it } from 'vitest';
import { Application } from '../../src/core/Application';
import { Engine } from '../../src/core/Engine';
import { InputManager } from '../../src/input/InputManager';
import { ChaseCamera } from '../../src/cameras/ChaseCamera';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { Car } from '../../src/vehicles/Car';
import { CarVisual } from '../../src/vehicles/CarVisual';
import { Drivetrain } from '../../src/vehicles/Drivetrain';
import { PerformanceMonitor } from '../../src/core/PerformanceMonitor';
import { SceneManager } from '../../src/core/SceneManager';
import { DiagnosticsOverlay } from '../../src/ui/DiagnosticsOverlay';
import {
  ASSET_MANIFEST_URL,
  findEnvironmentAsset,
  loadEnvironmentAsset,
  loadHdrTexture,
  readAssetManifest,
} from '../../src/assets/AssetManifest';
import { applySunPosition, createAtmosphereSky } from '../../src/shaders/atmosphere-sky';
import { createGroundGridColorNode, linearColor } from '../../src/shaders/ground-grid';
import { TIER_ORDER } from '../../src/config/tiers';
import {
  applyBackendOverride,
  applyTier,
  describeTier,
  readBackendRequest,
  readTierRequest,
  resolveTier,
} from '../../src/core/QualityTier';

/**
 * Module-level API checks. These run in a Node environment and deliberately do not
 * instantiate WebGL objects; real rendering is verified in the browser smoke test.
 */
const prototypeMethods = (type: unknown): string[] =>
  typeof type === 'function'
    ? Object.getOwnPropertyNames((type as { prototype: object }).prototype)
    : [];

describe('core module API surface', () => {
  it('exposes the engine lifecycle and wiring API', () => {
    const methods = prototypeMethods(Engine);
    for (const method of [
      'init',
      'start',
      'stop',
      'resize',
      'render',
      'dispose',
      'onFrame',
      'onResize',
      'onContextLost',
      'onContextRestored',
      'onFrameError',
      'getRenderStatistics',
    ]) {
      expect(methods).toContain(method);
    }
  });

  it('exposes the scene manager API', () => {
    const methods = prototypeMethods(SceneManager);
    for (const method of [
      'loadEnvironment',
      'update',
      'setDebugCameraEnabled',
      'addObject',
      'removeObject',
      'followCamera',
      'setShadowCamera',
      'focusSun',
      'resize',
      'getObjectCount',
      'getDiagnostics',
      'dispose',
    ]) {
      expect(methods).toContain(method);
    }
  });

  it('exposes the Phase 3 asset manifest API', () => {
    for (const fn of [
      readAssetManifest,
      findEnvironmentAsset,
      loadEnvironmentAsset,
      loadHdrTexture,
    ]) {
      expect(typeof fn).toBe('function');
    }
    expect(ASSET_MANIFEST_URL).toBe('assets/manifest.json');
  });

  it('exposes the Phase 3 quality-tier API', () => {
    for (const fn of [
      resolveTier,
      applyTier,
      describeTier,
      readTierRequest,
      readBackendRequest,
      applyBackendOverride,
    ]) {
      expect(typeof fn).toBe('function');
    }
    expect(TIER_ORDER).toEqual(['C', 'B', 'A']);
  });

  it('exposes the Phase 3 shader node factories', () => {
    for (const fn of [
      createAtmosphereSky,
      applySunPosition,
      createGroundGridColorNode,
      linearColor,
    ]) {
      expect(typeof fn).toBe('function');
    }
  });

  it('exposes the application composition API', () => {
    const methods = prototypeMethods(Application);
    for (const method of ['start', 'stop', 'getDiagnostics', 'dispose']) {
      expect(methods).toContain(method);
    }
  });

  it('exposes the diagnostics overlay API used by the composition root', () => {
    const methods = prototypeMethods(DiagnosticsOverlay);
    for (const method of ['update', 'dispose']) {
      expect(methods).toContain(method);
    }
  });

  it('exposes the Phase 2 module API surface', () => {
    const surfaces: [unknown, string[]][] = [
      [
        PhysicsWorld,
        [
          'update',
          'addPreStepHandler',
          'addPostStepHandler',
          'createDynamicBody',
          'attachCollider',
          'removeBody',
          'resetAccumulator',
          'dispose',
        ],
      ],
      [Car, ['setActions', 'getInterpolatedPose', 'reset', 'dispose']],
      [CarVisual, ['sync', 'dispose']],
      [InputManager, ['attach', 'detach', 'reset', 'update', 'consumeCommands']],
      [ChaseCamera, ['snapTo', 'update', 'resize', 'dispose']],
      [Drivetrain, ['update', 'reset']],
    ];
    for (const [type, methods] of surfaces) {
      const names = prototypeMethods(type);
      for (const method of methods) {
        expect(names).toContain(method);
      }
    }
  });

  it('keeps the diagnostics snapshot fields consumed by the HUD', () => {
    const monitor = new PerformanceMonitor(8);
    const statistics = monitor.snapshot();
    for (const field of [
      'sampleCount',
      'averageFramesPerSecond',
      'minimumFramesPerSecond',
      'averageFrameTimeMilliseconds',
      'p95FrameTimeMilliseconds',
      'worstFrameTimeMilliseconds',
    ]) {
      expect(Object.keys(statistics)).toContain(field);
    }
  });
});
