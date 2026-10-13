import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  Color,
  type BufferGeometry,
  type Material,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RenderConfig } from '../config/render';
import { WORLD_CONFIG, type GridConfig, type WorldConfig } from '../config/world';
import type { Vec3 } from '../shared/vector';
import type { Viewport } from './Engine';

export interface SceneManagerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly config: RenderConfig;
  readonly worldConfig?: WorldConfig;
  readonly aspect: number;
}

export interface SceneDiagnostics {
  readonly objectCount: number;
  readonly cameraPosition: { readonly x: number; readonly y: number; readonly z: number };
}

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldDirection;

void main() {
  vWorldDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Three-stop gradient dome. The tone-mapping and color-space chunks are included so the
 * dome matches the tone-mapped scene instead of glowing outside the exposure curve.
 */
const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform float gradientExponent;

varying vec3 vWorldDirection;

void main() {
  float height = normalize(vWorldDirection).y;
  float above = pow(clamp(height, 0.0, 1.0), gradientExponent);
  float below = clamp(-height * 5.0, 0.0, 1.0);
  vec3 sky = mix(horizonColor, zenithColor, above);
  gl_FragColor = vec4(mix(sky, groundColor, below), 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Sun/shadow focus quantization in meters; keeps the shadow map from crawling under motion. */
const SHADOW_FOCUS_SNAP = 2;

/**
 * Owns the scene graph: sky, reference lighting with a shadow-casting sun, the static arena
 * ground, and the debug orbit camera.
 *
 * Phase 2 responsibilities added to the Phase 1 foundation:
 * - ground and obstacle geometry come from `WORLD_CONFIG`, the same source the physics world
 *   builds its colliders from, so visuals and colliders cannot drift apart;
 * - the sun and its shadow frustum follow the vehicle (`focusSun`), because a fixed shadow
 *   camera would leave the car without shadows after a few seconds of driving;
 * - the debug orbit camera can be enabled/disabled so gameplay owns the render camera while the
 *   orbit controls remain available for inspection.
 *
 * Every resource created here is released in `dispose`. The ground and obstacles remain temporary
 * placeholders for the procedural world planned in Phase 3.
 */
export class SceneManager {
  readonly scene: Scene;
  /** Debug orbit camera. Gameplay renders through the chase camera owned by the application. */
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly #sun: DirectionalLight;
  readonly #sunOffset: Vector3;
  readonly #sunTarget = new Vector3();
  readonly #addedObjects = new Set<Object3D>();
  readonly #disposables: readonly (() => void)[];

  constructor(options: SceneManagerOptions) {
    const { config } = options;
    const worldConfig = options.worldConfig ?? WORLD_CONFIG;
    const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1;

    this.scene = new Scene();
    this.scene.background = new Color(config.sky.horizonColor);
    if (config.sky.fogEnabled) {
      this.scene.fog = new Fog(config.sky.horizonColor, config.sky.fogNear, config.sky.fogFar);
    }

    this.camera = new PerspectiveCamera(
      config.camera.fov,
      aspect,
      config.camera.near,
      config.camera.far,
    );
    this.camera.position.set(...config.camera.position);
    this.camera.lookAt(...config.camera.target);

    this.controls = new OrbitControls(this.camera, options.canvas);
    this.controls.target.set(...config.camera.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = config.camera.dampingFactor;
    this.controls.minDistance = config.camera.minDistance;
    this.controls.maxDistance = config.camera.maxDistance;
    this.controls.maxPolarAngle = config.camera.maxPolarAngle;
    this.controls.update();

    const sky = createSkyDome(config);
    const ground = createGround(worldConfig);
    const obstacles = createObstacles(worldConfig);
    const ambient = new AmbientLight(
      config.lighting.ambientColor,
      config.lighting.ambientIntensity,
    );
    this.#sun = createSun(config);
    this.#sunOffset = new Vector3(...config.lighting.sunPosition);

    this.scene.add(sky, ground, ambient, this.#sun, this.#sun.target);
    if (obstacles.length > 0) {
      this.scene.add(...obstacles);
    }

    this.#disposables = [() => this.controls.dispose(), () => disposeObjectTree(this.scene)];
  }

  /**
   * Advances camera damping. Only the debug camera needs per-frame updates; the chase camera is
   * driven by its own system.
   */
  update(delta: number): void {
    if (this.controls.enabled) {
      this.controls.update(delta);
    }
  }

  /** Enables or disables the debug orbit camera and its input handling. */
  setDebugCameraEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
    if (enabled) {
      this.controls.update();
    }
  }

  /** Adds a render object that the scene manager must dispose with the scene. */
  addObject(object: Object3D): void {
    this.#addedObjects.add(object);
    this.scene.add(object);
  }

  removeObject(object: Object3D): void {
    this.#addedObjects.delete(object);
    object.removeFromParent();
  }

  /**
   * Moves the sun and its shadow frustum to follow the vehicle.
   *
   * The focus is quantized to a couple of meters so the shadow map does not shimmer as the car
   * creeps forward, and the vertical focus stays at ground level so the shadow camera always
   * points at the surface shadows land on.
   */
  focusSun(position: Vec3): void {
    const x = Math.round(position.x / SHADOW_FOCUS_SNAP) * SHADOW_FOCUS_SNAP;
    const z = Math.round(position.z / SHADOW_FOCUS_SNAP) * SHADOW_FOCUS_SNAP;
    this.#sunTarget.set(x, 0, z);
    this.#sun.target.position.copy(this.#sunTarget);
    this.#sun.position.set(x + this.#sunOffset.x, this.#sunOffset.y, z + this.#sunOffset.z);
    this.#sun.target.updateMatrixWorld();
    this.#sun.updateMatrixWorld();
  }

  resize(viewport: Viewport): void {
    this.camera.aspect = viewport.aspect;
    this.camera.updateProjectionMatrix();
  }

  getObjectCount(): number {
    let count = 0;
    this.scene.traverse(() => {
      count += 1;
    });
    return count;
  }

  getDiagnostics(): SceneDiagnostics {
    const { x, y, z } = this.camera.position;
    return {
      objectCount: this.getObjectCount(),
      cameraPosition: { x, y, z },
    };
  }

  dispose(): void {
    this.#addedObjects.clear();
    for (const dispose of this.#disposables) {
      dispose();
    }
  }
}

function createSkyDome(config: RenderConfig): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      zenithColor: { value: new Color(config.sky.zenithColor) },
      horizonColor: { value: new Color(config.sky.horizonColor) },
      groundColor: { value: new Color(config.sky.groundColor) },
      gradientExponent: { value: config.sky.gradientExponent },
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });

  const sky = new Mesh(new SphereGeometry(config.sky.radius, 32, 16), material);
  sky.name = 'sky-dome';
  // The camera is always inside the dome; skip culling math for a static backdrop.
  sky.frustumCulled = false;
  // The dome is a backdrop, never a solid occluder. Without this it is drawn among the opaque
  // objects after depth-less geometry and paints over it — visibly erasing every grid line below
  // the horizon. Rendering first with depth testing disabled guarantees the dome sits behind
  // everything regardless of draw order.
  sky.renderOrder = -1;
  material.depthTest = false;
  return sky;
}

function createGround(worldConfig: WorldConfig): Mesh {
  const { ground } = worldConfig;
  const material = new MeshStandardMaterial({
    color: new Color(ground.color),
    roughness: ground.roughness,
    metalness: ground.metalness,
  });

  if (ground.grid.enabled) {
    applyProceduralGrid(material, ground.grid);
  }

  const mesh = new Mesh(new PlaneGeometry(ground.size, ground.size), material);
  mesh.name = 'ground-plane';
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Static obstacle meshes. Phase 2 keeps the Phase 1 reference blocks as physics test targets; the
 * collider for each one is built by `PhysicsWorld` from the same definitions.
 */
function createObstacles(worldConfig: WorldConfig): Mesh[] {
  return worldConfig.obstacles.map((obstacle) => {
    const geometry = new BoxGeometry(...obstacle.size);
    const material = new MeshStandardMaterial({
      color: new Color(obstacle.color),
      roughness: 0.8,
      metalness: 0,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = `obstacle-${obstacle.id}`;
    mesh.position.set(...obstacle.position);
    mesh.castShadow = obstacle.castShadow;
    mesh.receiveShadow = true;
    return mesh;
  });
}

interface GridUniforms {
  readonly gridLineColor: { value: Color };
  readonly gridCenterLineColor: { value: Color };
  readonly gridSpacing: { value: number };
  readonly gridLineWidth: { value: number };
  readonly gridFadeDistance: { value: number };
  readonly gridStrength: { value: number };
}

/**
 * Draws the reference grid inside the ground material instead of as separate coplanar geometry.
 *
 * A `GridHelper` 1-2 cm above an 800 m plane z-fights badly: at that scale the depth buffer cannot
 * resolve two nearly coincident surfaces, so distant lines dissolve and the surface visibly
 * flickers. Deriving anti-aliased lines from the world position keeps the plane a single surface,
 * respects the PBR lighting/shadows, and fades the grid out before it aliases at distance.
 *
 * This is what Phase 3 terrain material blending will build on; it is replaced, not extended, by
 * authored roads and terrain splatting.
 */
function applyProceduralGrid(material: MeshStandardMaterial, grid: GridConfig): void {
  const uniforms: GridUniforms = {
    gridLineColor: { value: new Color(grid.lineColor) },
    gridCenterLineColor: { value: new Color(grid.centerLineColor) },
    gridSpacing: { value: grid.spacing },
    gridLineWidth: { value: grid.lineWidth },
    gridFadeDistance: { value: grid.fadeDistance },
    gridStrength: { value: grid.strength },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        ['#include <common>', 'varying vec3 vGridWorldPosition;'].join('\n'),
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          'vGridWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
        ].join('\n'),
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vGridWorldPosition;',
          'uniform vec3 gridLineColor;',
          'uniform vec3 gridCenterLineColor;',
          'uniform float gridSpacing;',
          'uniform float gridLineWidth;',
          'uniform float gridFadeDistance;',
          'uniform float gridStrength;',
          '',
          'float gridCoverage( vec2 coord, float width ) {',
          '  vec2 derivative = max( fwidth( coord ), vec2( 1e-5 ) );',
          '  vec2 distanceToLine = abs( fract( coord - 0.5 ) - 0.5 ) / derivative;',
          '  float line = min( distanceToLine.x, distanceToLine.y );',
          '  return 1.0 - min( line / width, 1.0 );',
          '}',
        ].join('\n'),
      )
      .replace(
        '#include <color_fragment>',
        [
          '#include <color_fragment>',
          '{',
          '  vec2 planeCoord = vGridWorldPosition.xz;',
          '  float gridMask = gridCoverage( planeCoord / gridSpacing, gridLineWidth );',
          '  vec2 axisDerivative = max( fwidth( planeCoord ), vec2( 1e-5 ) );',
          '  vec2 axisDistance = abs( planeCoord ) / ( axisDerivative * gridLineWidth * 3.0 );',
          '  float axisMask = 1.0 - min( min( axisDistance.x, axisDistance.y ), 1.0 );',
          '  float visibility = 1.0 - smoothstep( gridFadeDistance * 0.5, gridFadeDistance,',
          '    distance( vGridWorldPosition, cameraPosition ) );',
          '  vec3 lineColor = mix( gridLineColor, gridCenterLineColor, axisMask );',
          '  float blend = max( gridMask, axisMask ) * gridStrength * visibility;',
          '  diffuseColor.rgb = mix( diffuseColor.rgb, lineColor, blend );',
          '}',
        ].join('\n'),
      );
  };

  // Distinguish the patched program from the stock MeshStandardMaterial program.
  material.customProgramCacheKey = () => 'endless-driver-ground-grid';
}

function createSun(config: RenderConfig): DirectionalLight {
  const sun = new DirectionalLight(
    new Color(config.lighting.sunColor),
    config.lighting.sunIntensity,
  );
  sun.name = 'sun';
  sun.position.set(...config.lighting.sunPosition);
  sun.castShadow = true;
  sun.shadow.mapSize.set(config.shadows.mapSize, config.shadows.mapSize);
  sun.shadow.camera.left = -config.shadows.cameraBounds;
  sun.shadow.camera.right = config.shadows.cameraBounds;
  sun.shadow.camera.top = config.shadows.cameraBounds;
  sun.shadow.camera.bottom = -config.shadows.cameraBounds;
  sun.shadow.camera.near = config.shadows.cameraNear;
  sun.shadow.camera.far = config.shadows.cameraFar;
  sun.shadow.bias = config.shadows.bias;
  sun.shadow.normalBias = config.shadows.normalBias;
  // Only consulted by the VSM filter; ignored by PCF.
  sun.shadow.blurSamples = config.shadows.vsmBlurSamples;
  sun.target.name = 'sun-target';
  return sun;
}

function disposeObjectTree(scene: Scene): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();

  scene.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    geometries.add(object.geometry);
    if (Array.isArray(object.material)) {
      for (const material of object.material) {
        materials.add(material);
      }
    } else {
      materials.add(object.material);
    }
  });

  for (const geometry of geometries) {
    geometry.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
  scene.clear();
}
