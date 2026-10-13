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
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RenderConfig } from '../config/render';
import type { Viewport } from './Engine';

export interface SceneManagerOptions {
  readonly canvas: HTMLCanvasElement;
  readonly config: RenderConfig;
  readonly aspect: number;
}

interface ReferencePropDefinition {
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly color: number;
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

/**
 * Owns the Phase 1 scene graph: sky, reference lighting with a shadow-casting sun,
 * temporary ground/grid, the debug camera, and its orbit controls.
 *
 * Every resource created here is released in `dispose`, and the ground, grid, and
 * reference props are explicitly temporary placeholders for the procedural world
 * planned in Phase 3.
 */
export class SceneManager {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly #disposables: readonly (() => void)[];

  constructor(options: SceneManagerOptions) {
    const { config } = options;
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
    const ground = createGround(config);
    const props = createReferenceProps(config);
    const ambient = new AmbientLight(
      config.lighting.ambientColor,
      config.lighting.ambientIntensity,
    );
    const sun = createSun(config);

    this.scene.add(sky, ground, ambient, sun, sun.target);
    if (props.length > 0) {
      this.scene.add(...props);
    }

    this.#disposables = [() => this.controls.dispose(), () => disposeObjectTree(this.scene)];
  }

  /** Advances camera damping. Physics and world systems will hook in from later phases. */
  update(delta: number): void {
    this.controls.update(delta);
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
  // objects after depth-less geometry (the translucent debug grid) and paints over it — visibly
  // erasing every grid line below the horizon. Rendering first with depth testing disabled
  // guarantees the dome sits behind everything regardless of draw order.
  sky.renderOrder = -1;
  material.depthTest = false;
  return sky;
}

function createGround(config: RenderConfig): Mesh {
  const material = new MeshStandardMaterial({
    color: new Color(config.ground.color),
    roughness: config.ground.roughness,
    metalness: config.ground.metalness,
  });

  if (config.ground.grid.enabled) {
    applyProceduralGrid(material, config);
  }

  const ground = new Mesh(new PlaneGeometry(config.ground.size, config.ground.size), material);
  ground.name = 'ground-plane';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  return ground;
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
 * Draws the Phase 1 reference grid inside the ground material instead of as separate coplanar
 * geometry.
 *
 * A `GridHelper` 1-2 cm above an 800 m plane z-fights badly: at that scale the depth buffer cannot
 * resolve two nearly coincident surfaces, so distant lines dissolve and the surface visibly
 * flickers. Deriving anti-aliased lines from the world position keeps the plane a single surface,
 * respects the PBR lighting/shadows, and fades the grid out before it aliases at distance.
 *
 * This is what Phase 3 terrain material blending will build on; it is replaced, not extended, by
 * authored roads and terrain splatting.
 */
function applyProceduralGrid(material: MeshStandardMaterial, config: RenderConfig): void {
  const uniforms: GridUniforms = {
    gridLineColor: { value: new Color(config.ground.grid.lineColor) },
    gridCenterLineColor: { value: new Color(config.ground.grid.centerLineColor) },
    gridSpacing: { value: config.ground.grid.spacing },
    gridLineWidth: { value: config.ground.grid.lineWidth },
    gridFadeDistance: { value: config.ground.grid.fadeDistance },
    gridStrength: { value: config.ground.grid.strength },
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

/**
 * Temporary shadow-casting props. Without a caster there is nothing to prove the sun's
 * shadow configuration works, so Phase 1 ships three neutral boxes that are removed
 * once real world content exists.
 */
function createReferenceProps(config: RenderConfig): Mesh[] {
  if (!config.referenceProps.enabled) {
    return [];
  }

  const definitions: readonly ReferencePropDefinition[] = [
    { position: [-14, 1.5, -10], size: [3, 3, 3], color: 0xb6bec8 },
    { position: [11, 1, 7], size: [2.5, 2, 2.5], color: 0xa7b1bd },
    { position: [2, 2.5, -20], size: [4, 5, 2], color: 0x99a4b1 },
  ];

  return definitions.map((definition, index) => {
    const geometry = new BoxGeometry(...definition.size);
    const material = new MeshStandardMaterial({
      color: new Color(definition.color),
      roughness: 0.8,
      metalness: 0,
    });
    const prop = new Mesh(geometry, material);
    prop.name = `reference-prop-${index + 1}`;
    prop.position.set(...definition.position);
    prop.castShadow = config.referenceProps.castShadow;
    prop.receiveShadow = true;
    return prop;
  });
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
