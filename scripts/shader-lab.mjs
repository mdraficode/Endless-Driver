/**
 * Shader lab: run three's WebGPU common renderer with a stub backend on Node, so the full
 * TSL code generation (the part that costs the phone 81 s of GPU compile) can be reproduced
 * offline in milliseconds. Captures every generated stage (code + name) from
 * `renderer._pipelines.programs` — the same registry the device inventory reads.
 *
 * Usage:
 *   node scripts/shader-lab.mjs                    # mixed shadow scene (default)
 *   MODE=facade-literal node scripts/shader-lab.mjs # 30 facade materials, TSL literal constants
 *   MODE=facade-uniform node scripts/shader-lab.mjs # 30 facade materials, uniform nodes
 *
 * The two facade modes are the regression instrument for the program-count fix (2026-11-01):
 * literal constants are baked into the generated code (one program per material), uniform
 * nodes are not (one program per graph shape). Expected: 32 vs 3 fragment stages.
 */
// All imports from the src paths (one module instance) — 'three/webgpu' resolves to the
// prebuilt bundle, whose classes would not match the src-based StandardNodeLibrary's keys.
import { Mesh } from 'three/src/objects/Mesh.js';
import { Scene } from 'three/src/scenes/Scene.js';
import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js';
import { DirectionalLight } from 'three/src/lights/DirectionalLight.js';
import { PointLight } from 'three/src/lights/PointLight.js';
import { SpotLight } from 'three/src/lights/SpotLight.js';
import { AmbientLight } from 'three/src/lights/AmbientLight.js';
import { BoxGeometry } from 'three/src/geometries/BoxGeometry.js';
import { SphereGeometry } from 'three/src/geometries/SphereGeometry.js';
import { MeshStandardMaterial } from 'three/src/materials/MeshStandardMaterial.js';
import { InstancedMesh } from 'three/src/objects/InstancedMesh.js';
import { Matrix4 } from 'three/src/math/Matrix4.js';
import { DataTexture } from 'three/src/textures/DataTexture.js';
import MeshPhysicalNodeMaterial from 'three/src/materials/nodes/MeshPhysicalNodeMaterial.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { Color } from 'three/src/math/Color.js';
import { uniform, vec4, positionWorld, sin } from 'three/src/nodes/TSL.js';
import { PCFShadowMap, SRGBColorSpace, NoToneMapping } from 'three/src/constants.js';
import fs from 'node:fs';

// Node has no `self`; the renderer's animation loop and yieldToMain use rAF as their
// scheduler, so the shim must actually run the callbacks (or compilation deadlocks).
globalThis.self = globalThis;
let rafId = 0;
const rafCallbacks = new Map();
globalThis.requestAnimationFrame = (callback) => {
  const id = ++rafId;
  rafCallbacks.set(id, callback);
  setTimeout(() => {
    const fn = rafCallbacks.get(id);
    rafCallbacks.delete(id);
    if (fn) fn(performance.now());
  }, 0);
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  rafCallbacks.delete(id);
};
// TextureNode type-checks its source against browser-only globals.
globalThis.ImageBitmap = class ImageBitmap {};
globalThis.HTMLImageElement = class HTMLImageElement {};
globalThis.HTMLCanvasElement = class HTMLCanvasElement {};

const Renderer = (await import('three/src/renderers/common/Renderer.js')).default;
const RenderPipeline = (await import('three/src/renderers/common/RenderPipeline.js')).default;
const { pass } = await import('three/src/nodes/display/PassNode.js');
const { mrt, output, float, renderOutput, normalView } = await import('three/src/nodes/TSL.js');
// The exact code generator the phone (webgl2 fallback backend) compiles.
const GLSLNodeBuilder = (
  await import('three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js')
).default;
// Maps MeshStandardMaterial & co to their node implementations (WebGPURenderer does this).
const StandardNodeLibrary = (
  await import('three/src/renderers/webgpu/nodes/StandardNodeLibrary.js')
).default;

/**
 * The minimum the common Renderer needs from a backend: known methods get real-enough
 * stand-ins, everything else is a no-op (a wrong shape fails loudly and gets special-cased).
 */
const makeBackend = () => {
  const dom = {
    getBoundingClientRect: () => ({ width: 960, height: 432 }),
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const data = new WeakMap();
  const special = {
    init: async () => {},
    getDomElement: () => dom,
    getDevice: () => ({}),
    createNodeBuilder: (object, renderer) => new GLSLNodeBuilder(object, renderer),
    createProgram: (stage) => ({ id: 1, code: stage.code, stage: stage.stage }),
    getBindGroupLayouts: () => [],
    createRenderPipeline: (renderObject) => {
      // The real backend records the compiled program under the pipeline object; isReady()
      // checks exactly that, so the stub must too (or every object looks uncompiled forever).
      data.set(renderObject.pipeline, { pipeline: {} });
    },
    getRenderPipelineCacheKey: () => 1,
    updateSize: () => {},
    isWebGLBackend: true,
    coordinateSystem: 2000, // WebGLCoordinateSystem (what the webgl2 fallback reports)
    capabilities: {
      getMaxAnisotropy: () => 8,
      getUniformBufferLimit: () => 65536,
    },
    data,
    get: (key) => data.get(key) ?? {},
    createTexture: (texture) => {
      data.set(texture, {});
      return {};
    },
    createAttribute: (attribute) => {
      data.set(attribute, {});
    },
    createIndexAttribute: (attribute) => {
      data.set(attribute, {});
    },
    createRenderTargetTexture: (texture) => {
      data.set(texture, {});
      return {};
    },
    getSize: () => ({ width: 960, height: 432 }),
    getPixelRatio: () => 1,
    getContext: () => ({}),
    getClearColor: () => [0, 0, 0, 1],
    hasFeature: () => true,
    hasCompatibility: () => true,
    needsRenderUpdate: () => false,
    isOccluded: () => false,
    getTimestampUID: () => 0,
  };
  // A value that tolerates any property access AND any call: render-pass objects and other
  // backend results are used opaquely (begin/draw/end/...) and the no-op fallback must not
  // break the chain.
  const anyValue = new Proxy(function () {}, {
    get: (target, prop) => (prop === Symbol.toPrimitive ? () => 0 : anyValue),
    apply: () => anyValue,
  });
  return new Proxy(special, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string') {
        return () => anyValue;
      }
      return undefined;
    },
  });
};

async function buildRenderer() {
  const backend = makeBackend();
  const renderer = new Renderer(backend, { antialias: false, alpha: false });
  renderer.library = new StandardNodeLibrary();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  await renderer.init();
  renderer.setSize(960, 432);
  return renderer;
}

function shadowMixScene() {
  const scene = new Scene();

  const sun = new DirectionalLight(0xffffff, 3);
  sun.position.set(30, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02; // tier-C sun values (config/render.ts)
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  scene.add(sun);

  // N shadow-casting point lights — the experiment: how many ShadowMaterial fragment
  // variants does the lab produce for N lights? (The phone shows 57.)
  const lampCount = Number(process.env.LAMPS ?? 2);
  for (let i = 0; i < lampCount; i++) {
    const lamp = new PointLight(0xffb46b, 8, 30, 2);
    lamp.position.set(5 - i * 3, 4, 5 + i * 2);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(256, 256);
    scene.add(lamp);
  }

  const headlight = new SpotLight(0xffffff, 20, 40, 0.5, 0.4, 1);
  headlight.position.set(0, 2, 10);
  scene.add(headlight);
  scene.add(new AmbientLight(0x223344, 0.4));

  // Non-shadow-casting point lights (the phone's street lamps: castShadow = false).
  const extraLights = Number(process.env.LIGHTS ?? 0);
  for (let i = 0; i < extraLights; i++) {
    const lamp = new PointLight(0xffd9a0, 5, 25, 2);
    lamp.position.set(i * 5 - 10, 3, 6 + (i % 3));
    lamp.castShadow = false;
    scene.add(lamp);
  }

  const makeTex = (seed) => {
    const size = 8;
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 7 + seed) % 256;
    return new DataTexture(data, size, size);
  };
  // Textures that "arrive" mid-run (the phone loads its 14 MB of assets DURING the compile).
  const texArrivals = [];
  for (let t = 0; t < 12; t++) {
    const tex = makeTex(t * 37);
    tex.needsUpdate = false; // not uploaded yet
    texArrivals.push(tex);
  }
  const ground = new MeshStandardMaterial({ color: 0x333844, roughness: 0.9, map: texArrivals[0] });
  const box = new MeshStandardMaterial({
    color: 0x884422,
    roughness: 0.6,
    metalness: 0.1,
    map: texArrivals[1],
  });

  for (let i = 0; i < 6; i++) {
    const mesh = new Mesh(new BoxGeometry(1, 3, 1), box);
    mesh.position.set(i * 3 - 8, 1.5, 0);
    mesh.castShadow = true;
    scene.add(mesh);
  }

  // Instanced casters (the city is mostly instanced) — the shadow pass renders these too.
  const instancedMat = ground.clone();
  instancedMat.map = texArrivals[4];
  const instanced = new InstancedMesh(new BoxGeometry(0.6, 5, 0.6), instancedMat, 24);
  const matrix = new Matrix4();
  for (let i = 0; i < 24; i++) {
    matrix.setPosition((i % 8) * 3 - 11, 2.5, -3 + Math.floor(i / 8) * 4);
    instanced.setMatrixAt(i, matrix);
  }
  instanced.castShadow = true;
  scene.add(instanced);

  const sphereMat = box.clone();
  sphereMat.map = texArrivals[3];
  const sphere = new Mesh(new SphereGeometry(1.5, 16, 12), sphereMat);
  sphere.position.set(2, 1.5, 6);
  sphere.castShadow = true;
  scene.add(sphere);

  const floor = new Mesh(new BoxGeometry(40, 0.2, 30), ground.clone());
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);

  // Transparent objects: their render order is sorted by camera distance each frame, which
  // changes the node build order (and therefore uniform index allocation) frame to frame.
  const glass = new MeshStandardMaterial({
    color: 0x88aacc,
    roughness: 0.1,
    transparent: true,
    opacity: 0.5,
    map: texArrivals[2],
  });
  for (let i = 0; i < 8; i++) {
    const pane = new Mesh(new BoxGeometry(2, 3, 0.1), glass);
    pane.position.set(i * 4 - 14, 1.5, 8);
    scene.add(pane);
  }
  return { scene, texArrivals };
}

/**
 * The facade-material experiment: N physical materials with the same procedural detail graph,
 * differing only in color/roughness/clearcoat. `facade-literal` bakes the values as TSL
 * constants (what createArchitecturalMaterial does today); `facade-uniform` uses uniform
 * nodes. Count the distinct fragment codes each mode produces — the answer to whether
 * uniform nodes collapse the 58 numbered facade materials into one program.
 */
function facadeBenchmarkScene(mode) {
  const scene = new Scene();
  const sun = new DirectionalLight(0xffffff, 3);
  sun.position.set(30, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  scene.add(new AmbientLight(0x223344, 0.4));

  const detail = (roughness, amplitude, withUniforms) => {
    // Mirror of src/world/architectural-materials.ts (same graph shape).
    const broad = sin(positionWorld.x.mul(0.083).add(positionWorld.z.mul(0.117))).mul(
      sin(positionWorld.z.mul(0.071).sub(positionWorld.y.mul(0.049))),
    );
    const fine = sin(
      positionWorld.x.mul(2.31).add(positionWorld.y.mul(1.67)).add(positionWorld.z.mul(2.83)),
    );
    const albedo = withUniforms
      ? float1()
          .add(broad.mul(uniform(amplitude, 'float')))
          .add(fine.mul(uniform(amplitude, 'float').mul(0.22)))
      : float1()
          .add(broad.mul(amplitude))
          .add(fine.mul(amplitude * 0.22));
    const roughnessNode = withUniforms
      ? uniform(roughness, 'float').add(broad.mul(0.055)).add(fine.mul(0.018)).clamp(0.06, 0.98)
      : float1().add(broad.mul(0.055)).add(fine.mul(0.018)).clamp(0.06, 0.98);
    return { albedo, roughness: roughnessNode };
  };
  const float1 = () => /* @__PURE__ */ sin(positionWorld.x).sub(sin(positionWorld.x)); // constant 1.0 via TSL ops

  const N = 30;
  const geo = new BoxGeometry(1, 6, 1);
  for (let i = 0; i < N; i++) {
    const material = new MeshPhysicalNodeMaterial();
    const color = new Color().setHSL((i * 0.137) % 1, 0.35, 0.5);
    const d = detail(0.77 + i * 0.001, 0.025 + (i % 3) * 0.005, mode === 'facade-uniform');
    if (mode === 'facade-literal') {
      material.colorNode = vec4(color.r, color.g, color.b, 1).mul(d.albedo);
      material.roughnessNode = d.roughness;
      material.clearcoatNode = /* @__PURE__ */ (function (v) {
        return v;
      })(0.08 + i * 0.001);
    } else {
      material.colorNode = vec4(uniform(new Vector3(color.r, color.g, color.b), 'vec3'), 1).mul(
        d.albedo,
      );
      material.roughnessNode = d.roughness;
      material.clearcoatNode = uniform(0.08 + i * 0.001, 'float');
      material.clearcoatRoughnessNode = uniform(0.34 + i * 0.001, 'float');
    }
    material.name = `facade-${i}`;
    const mesh = new Mesh(geo, material);
    mesh.position.set((i % 10) * 4 - 18, 3, Math.floor(i / 10) * 4 - 4);
    mesh.castShadow = true;
    scene.add(mesh);
  }
  const floor = new Mesh(
    new BoxGeometry(60, 0.2, 20),
    new (function () {
      const m = new MeshStandardMaterial({ color: 0x333844, roughness: 0.9 });
      return m;
    })(),
  );
  floor.position.y = -0.1;
  scene.add(floor);
  const paneCount = Number(process.env.TRANSPARENT ?? 0);
  if (paneCount > 0) {
    // Camera-dependent depth sort, like the phone's glazing/sprite pass.
    const glassMat = new MeshStandardMaterial({
      color: 0x223344,
      roughness: 0.1,
      metalness: 0.4,
      transparent: true,
      opacity: 0.35,
    });
    for (let i = 0; i < paneCount; i++) {
      const pane = new Mesh(new BoxGeometry(2, 3, 0.1), glassMat);
      // Scattered depths: from a moving camera the depth order flips often, like city glazing.
      pane.position.set(((i * 7919) % 61) - 30, 1 + ((i * 104729) % 5), -8 + ((i * 15485863) % 21));
      scene.add(pane);
    }
  }
  return scene;
}

const geometryProbeMode = process.env.MODE === 'geometry';

/**
 * Geometry-identity probe: one shared material on several meshes. Group A shares ONE
 * geometry instance; group B gets DISTINCT geometry instances with identical attribute
 * content. If the device's per-mesh vertex-code drift is caused by geometry identity in the
 * build context, group B multiplies codes and group A does not.
 */
async function geometryProbe(backend) {
  const renderer = new Renderer(backend, { antialias: false, alpha: false });
  renderer.library = new StandardNodeLibrary();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  await renderer.init();
  renderer.setSize(960, 432);

  const scene = new Scene();
  scene.add(new AmbientLight(0x334455, 0.5));
  const sun = new DirectionalLight(0xffffff, 3);
  sun.position.set(30, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const cam = new PerspectiveCamera(75, 960 / 432, 0.1, 400);
  cam.position.set(0, 3, 20);
  cam.lookAt(0, 1, 0);

  const mat = new MeshStandardMaterial({ color: 0x884422, roughness: 0.6 });
  mat.name = 'probe';

  // Group B: distinct geometry instances with identical content, 6 meshes. Built FIRST.
  const matB = new MeshStandardMaterial({ color: 0x336688, roughness: 0.5 });
  matB.name = 'probeB';
  for (let i = 0; i < 6; i += 1) {
    const m = new Mesh(new BoxGeometry(1, 2, 1), matB);
    m.position.set(i * 2 - 5, 1, 6);
    m.castShadow = true;
    scene.add(m);
  }
  // Group A: one shared geometry instance, 6 meshes. Built second.
  const sharedGeo = new BoxGeometry(1, 2, 1);
  for (let i = 0; i < 6; i += 1) {
    const m = new Mesh(sharedGeo, mat);
    m.position.set(i * 2 - 5, 1, 0);
    m.castShadow = true;
    scene.add(m);
  }

  const codesOf = (name) =>
    new Set(
      [...renderer._pipelines.programs.vertex.values()]
        .filter((st) => st.name === name)
        .map((st) => st.code),
    ).size;
  const scenePass = pass(scene, cam);
  scenePass.setMRT(mrt({ output, normal: normalView, wetRoadMask: float(0) }));
  const pipeline = new RenderPipeline(renderer, renderOutput(scenePass));
  await renderer.compileAsync(scene, cam);
  pipeline.render();
  renderer.render(scene, cam);
  {
    const { Frustum } = await import('three/src/math/Frustum.js');
    const { Matrix4 } = await import('three/src/math/Matrix4.js');
    const mvp = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const fr = new Frustum();
    fr.setFromProjectionMatrix(mvp);
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.updateWorldMatrix(true, false);
        const sph = obj.geometry.boundingSphere.clone().applyMatrix4(obj.matrixWorld);
        console.log(
          `  mesh ${obj.material.name} pos=(${obj.position.x},${obj.position.y},${obj.position.z}) visible=${obj.visible} intersects=${fr.intersectsSphere(sph)}`,
        );
      }
    });
  }
  console.log(`geometry probe: shared-geo material vertex codes = ${codesOf('probe')} (6 meshes)`);
  console.log(
    `geometry probe: distinct-geo material vertex codes = ${codesOf('probeB')} (6 meshes)`,
  );
  process.exit(0);
}

const startupSequenceMode = process.env.MODE === 'startup';

/**
 * The device startup sequence, replayed: plain compile, MRT scene pass, a second pipeline from
 * a MIRROR camera (the SSR reflection pass), another compileAsync, then the 16-view settle
 * sweep. Counts how many distinct codes one textured material accumulates per step — the
 * probe for the device's 45-variant vegetation vertex codes.
 */
async function startupSequence(backend) {
  const renderer = new Renderer(backend, { antialias: false, alpha: false });
  renderer.library = new StandardNodeLibrary();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  await renderer.init();
  renderer.setSize(960, 432);

  const scene = new Scene();
  scene.add(new AmbientLight(0x334455, 0.5));
  const sun = new DirectionalLight(0xffffff, 3);
  sun.position.set(30, 40, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  for (let i = 0; i < 12; i++) {
    const lamp = new PointLight(0xffb46b, 8, 30, 2);
    lamp.position.set(Math.cos((i / 12) * 6.28) * 14, 4, Math.sin((i / 12) * 6.28) * 14);
    scene.add(lamp);
  }
  const cam = new PerspectiveCamera(75, 960 / 432, 0.1, 400);
  cam.position.set(0, 3, 14);
  cam.lookAt(0, 1, 0);
  const mirror = new PerspectiveCamera(75, 960 / 432, 0.1, 400);

  const mkTex = () => {
    const data = new Uint8Array(16);
    data.fill(128);
    const t = new DataTexture(data, 2, 2);
    t.needsUpdate = true;
    return t;
  };
  const mat = new MeshStandardMaterial({ color: 0x884422, roughness: 0.6, map: mkTex() });
  mat.name = 'probe';
  const box = new Mesh(new BoxGeometry(2, 4, 2), mat);
  box.position.set(0, 2, 0);
  box.castShadow = true;
  scene.add(box);
  const glassMat = new MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.35 });
  glassMat.name = 'glass';
  for (let i = 0; i < 40; i++) {
    const pane = new Mesh(new BoxGeometry(2, 3, 0.1), glassMat);
    pane.position.set(((i * 7919) % 61) - 30, 1 + ((i * 104729) % 5), -8 + ((i * 15485863) % 21));
    scene.add(pane);
  }

  const codes = () => {
    const p = renderer._pipelines.programs;
    const frag = new Set(
      [...p.fragment.values()].filter((s) => s.name === 'probe').map((s) => s.code),
    );
    const vert = new Set(
      [...p.vertex.values()].filter((s) => s.name === 'probe').map((s) => s.code),
    );
    return `${p.fragment.size}+${p.vertex.size} probeF=${frag.size} probeV=${vert.size}`;
  };

  console.log(`step0 initial:        ${codes()}`);
  const scenePassA = pass(scene, cam);
  scenePassA.setMRT(mrt({ output, normal: normalView, wetRoadMask: float(0) }));
  await scenePassA.compileAsync(renderer);
  console.log(`step1 pass compile:   ${codes()}`);
  renderer.render(scene, cam);
  console.log(`step1b plain render:  ${codes()}`);

  const scenePass = pass(scene, cam);
  scenePass.setMRT(mrt({ output, normal: normalView, wetRoadMask: float(0) }));
  const pipeline = new RenderPipeline(renderer, renderOutput(scenePass));
  pipeline.render();
  console.log(`step2 MRT pass:       ${codes()}`);

  // The SSR reflection pass: the scene re-rendered from a mirrored camera.
  mirror.position.set(0, 3, -14);
  mirror.lookAt(0, 1, 0);
  const mirrorPass = pass(scene, mirror);
  mirrorPass.setMRT(mrt({ output, normal: normalView, wetRoadMask: float(0) }));
  const mirrorPipeline = new RenderPipeline(renderer, renderOutput(mirrorPass));
  mirrorPipeline.render();
  pipeline.render();
  console.log(`step3 SSR mirror:     ${codes()}`);

  await renderer.compileAsync(scene, cam);
  console.log(`step4 re-compile:     ${codes()}`);

  // The 16-view settle sweep.
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * 6.28;
    cam.position.set(Math.cos(angle) * 14, 3 + (i % 3), Math.sin(angle) * 14);
    cam.lookAt(0, 1, 0);
    pipeline.render();
  }
  console.log(`step5 settle x16:     ${codes()}`);
  process.exit(0);
}

const main = async () => {
  if (geometryProbeMode) {
    await geometryProbe(makeBackend());
    return;
  }
  if (startupSequenceMode) {
    await startupSequence(makeBackend());
    return;
  }
  if (process.env.MODE === 'shadow') {
    await shadowProbe(makeBackend());
    return;
  }
  if (process.env.MODE === 'instance') {
    await instanceProbe(makeBackend());
    return;
  }
  console.log('lab: building renderer');
  const renderer = await buildRenderer();
  console.log('lab: renderer ready, shadowMap', renderer.shadowMap.enabled);
  let scene;
  let texArrivals = [];
  const mode = process.env.MODE ?? 'standard';
  if (mode === 'facade-literal' || mode === 'facade-uniform') {
    scene = facadeBenchmarkScene(mode);
  } else {
    ({ scene, texArrivals } = shadowMixScene());
  }
  const camera = new PerspectiveCamera(75, 960 / 432, 0.1, 400);
  camera.position.set(0, 3, 14);
  camera.lookAt(0, 2, 0);

  console.log('lab: compiling');
  const programs = renderer._pipelines.programs;
  await renderer.compileAsync(scene, camera);
  console.log('lab: compiled');

  // A few real frames: the shadow pass (per-light ShadowMaterial programs) is generated when
  // the light nodes update and render the shadow maps — that happens in render(), not in
  // compileAsync alone.
  const frames = Number(process.env.FRAMES ?? 3);
  const mirror = new PerspectiveCamera(75, 960 / 432, 0.1, 400);
  mirror.position.set(0, 3, -14);
  mirror.lookAt(0, 2, 0);
  // The phone's real frame flow: the scene renders inside a PassNode with MRT attachments,
  // wrapped in a RenderPipeline (fullscreen quad) — MRT=1 enables it in the lab.
  let pipeline = null;
  if (process.env.MRT === '1') {
    const scenePass = pass(scene, camera);
    scenePass.setMRT(mrt({ output, normal: normalView, wetRoadMask: float(0) }));
    pipeline = new RenderPipeline(renderer, renderOutput(scenePass));
  }
  const counts = [];
  const totalCodes = [];
  for (let i = 0; i < frames; i++) {
    // Simulate texture uploads landing mid-session: a version bump on a material's map forces
    // that material's node rebuild, interleaved with the shadow material's own builds.
    if (process.env.TEX === '1' && i > 0 && i % 2 === 0) {
      const tex = texArrivals[(i / 2) % texArrivals.length];
      tex.needsUpdate = true;
      tex.version += 1;
    }
    if (process.env.MOVE === '1') {
      // Orbit the camera so transparent-sort order changes every frame.
      camera.position.set(Math.cos(i * 0.2) * 14, 3, Math.sin(i * 0.2) * 14);
      camera.lookAt(0, 2, 0);
    }
    if (pipeline !== null) {
      pipeline.render();
    } else {
      renderer.render(scene, camera);
      if (i % 2 === 1) renderer.render(scene, mirror); // a second pass over the same scene
    }
    const fragVariants = new Set(
      [...programs.fragment.values()].filter((s) => s.name === 'ShadowMaterial').map((s) => s.code),
    );
    counts.push(fragVariants.size);
    totalCodes.push(programs.fragment.size + programs.vertex.size);
  }
  console.log(
    `lab: rendered ${frames} frames; ShadowMaterial fragment variants per frame: ${counts.join(',')}`,
  );
  console.log(`lab: total stages (frag+vert) per frame: ${totalCodes.join(',')}`);

  // The same registry the device inventory reads.

  const all = [
    ...programs.vertex.values(),
    ...programs.fragment.values(),
    ...programs.compute.values(),
  ];
  console.log(
    `total stages: ${all.length} (vertex ${programs.vertex.size}, fragment ${programs.fragment.size}, compute ${programs.compute.size})`,
  );
  const byName = new Map();
  for (const stage of all) {
    byName.set(stage.name ?? '', (byName.get(stage.name ?? '') ?? 0) + 1);
  }
  const groups = [...byName.entries()].sort((a, b) => b[1] - a[1]);
  console.log('groups:');
  for (const [name, count] of groups) console.log(`  ${count}× ${name || '(unnamed)'}`);

  // The animation loop keeps rAF chained forever; end the process once the data is out.
  const done = () => process.exit(0);

  if (mode === 'facade-literal' || mode === 'facade-uniform') {
    const fragmentCodes = new Map(); // name -> Set(code)
    for (const stage of programs.fragment.values()) {
      const codes = fragmentCodes.get(stage.name) ?? new Set();
      codes.add(stage.code);
      fragmentCodes.set(stage.name, codes);
    }
    let distinct = 0;
    for (const codes of fragmentCodes.values()) distinct += codes.size;
    const dumpStage = [...programs.fragment.values()].find((st) => st.name.startsWith('facade-0'));
    fs.writeFileSync(`/tmp/${mode}-frag.glsl`, dumpStage ? dumpStage.code : '(none)');
    console.log(
      `\nMODE ${mode}: ${fragmentCodes.size} materials -> ${distinct} distinct fragment codes (total fragment stages ${programs.fragment.size})`,
    );
    done();
    return;
  }

  // Dump the ShadowMaterial fragment codes so the diff between variants is visible.
  const shadowFragments = [...programs.fragment.values()].filter(
    (s) => s.name === 'ShadowMaterial',
  );
  const shadowVertices = [...programs.vertex.values()].filter((s) => s.name === 'ShadowMaterial');
  console.log(`\nShadowMaterial vertex variants: ${shadowVertices.length}`);
  console.log(`\nShadowMaterial fragment variants: ${shadowFragments.length}`);
  if (shadowFragments.length >= 1) {
    fs.writeFileSync('/tmp/shadow-frag-0.glsl', shadowFragments[0].code);
    if (shadowFragments[1]) fs.writeFileSync('/tmp/shadow-frag-1.glsl', shadowFragments[1].code);
    fs.writeFileSync(
      '/tmp/shadow-vert-0.glsl',
      [...programs.vertex.values()]
        .filter((s) => s.name === 'ShadowMaterial')
        .map((s) => s.code)
        .join('\n\n===== NEXT VARIANT =====\n\n'),
    );
    const [a, b] = shadowFragments;
    console.log(`--- variant 1 (first 600 chars) ---\n${a.code.slice(0, 600)}`);
    console.log(`--- variant 2 (first 600 chars) ---\n${b.code.slice(0, 600)}`);
    const n = Math.min(a.code.length, b.code.length);
    let diff = -1;
    for (let i = 0; i < n; i++) {
      if (a.code[i] !== b.code[i]) {
        diff = i;
        break;
      }
    }
    console.log(`first difference at offset ${diff} of ${a.code.length}/${b.code.length}`);
    if (diff >= 0) {
      console.log('A: ...' + JSON.stringify(a.code.slice(Math.max(0, diff - 80), diff + 120)));
      console.log('B: ...' + JSON.stringify(b.code.slice(Math.max(0, diff - 80), diff + 120)));
    }
  }
  done();
};

main().catch((error) => {
  console.error('SHADER LAB FAILED:', error);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// MODE=shadow  GROUP=1|2|3|4
// GROUP=1: 20 boxes, 20 distinct MeshStandardMaterial instances, identical props, no map
// GROUP=2: 20 boxes, 20 distinct instances, DISTINCT color per box
// GROUP=3: 20 boxes, 20 distinct instances, same color, DISTINCT DataTexture map per box
// GROUP=4: 20 boxes, ONE shared material instance
// Counts distinct vertex codes named ShadowMaterial after compile + render.
// ---------------------------------------------------------------------------
async function shadowProbe(backend) {
  const group = Number(process.env.GROUP || 1);
  const renderer = new Renderer(backend, { antialias: false, alpha: false });
  renderer.library = new StandardNodeLibrary();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  await renderer.init();
  renderer.setSize(960, 432);

  const scene = new Scene();
  const sun = new DirectionalLight(0xffffff, 3);
  sun.position.set(5, 10, 5);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {
    left: -12,
    right: 12,
    top: 8,
    bottom: -8,
    near: 0.5,
    far: 40,
  });
  sun.shadow.mapSize.set(256, 256);
  scene.add(sun, sun.target);
  const cam = new PerspectiveCamera(50, 960 / 432, 0.1, 100);
  cam.position.set(0, 6, 12);
  cam.lookAt(0, 0, 0);

  const mats = [];
  for (let i = 0; i < 20; i += 1) {
    const m = new MeshStandardMaterial({
      color: group === 2 ? 0x400000 + i * 0x12345 : 0x888888,
      roughness: 0.8,
    });
    if (group === 3) {
      const tex = new DataTexture(new Uint8Array([200, 120, 90, 255]), 1, 1);
      tex.needsUpdate = true;
      m.map = tex;
    }
    mats.push(m);
  }
  for (let i = 0; i < 20; i += 1) {
    const m = new Mesh(new BoxGeometry(1, 1, 1), group === 4 ? mats[0] : mats[i]);
    m.position.set((i % 10) * 2.4 - 10.5, 0.5, Math.floor(i / 10) * 2.4 - 1.2);
    m.castShadow = true;
    m.name = `box${i}`;
    scene.add(m);
  }

  const scenePass = pass(scene, cam);
  scenePass.setMRT(mrt({ output, normal: normalView, wetRoadMask: float(0) }));
  const pipeline = new RenderPipeline(renderer, renderOutput(scenePass));
  await renderer.compileAsync(scene, cam);
  pipeline.render();
  renderer.render(scene, cam);
  const allV = [...renderer._pipelines.programs.vertex.values()];
  const shadow = allV.filter((st) => st.name === 'ShadowMaterial');
  const distinct = new Set(shadow.map((st) => st.code)).size;
  console.log(
    `shadow probe GROUP=${group}: ShadowMaterial vertex stages=${shadow.length} distinct codes=${distinct}`,
  );
  console.log(
    `  all vertex stage names: ${[...new Map(allV.map((st) => [st.name, 0])).keys()].join(', ')}`,
  );
}

// ---------------------------------------------------------------------------
// MODE=instance  PATCH=0|1
// Two InstancedMeshes (16 instances each), identical material, different geometry
// data. Mirrors the device's pedestrian-actor duplication. With PATCH=1 the same
// (type, count) buffer naming from src/core/stable-shader-buffer-names.ts is
// applied (mirrored inline so the .mjs lab stays loader-free).
// Expect: PATCH=0 -> 2 distinct vertex codes; PATCH=1 -> 1.
// ---------------------------------------------------------------------------
async function instanceProbe(backend) {
  const patched = process.env.PATCH === '1';
  if (patched) {
    const GLSLNodeBuilder = (
      await import('three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js')
    ).default;
    const proto = GLSLNodeBuilder.prototype;
    const original = proto.getUniformFromNode;
    proto.getUniformFromNode = function (node, type, ...rest) {
      const uniformNode = original.call(this, node, type, ...rest);
      if (type === 'buffer' && node && node.isBufferNode === true) {
        const count = node.bufferCount;
        if (typeof node.bufferType === 'string' && Number.isInteger(count) && count > 0) {
          const stable = `${node.bufferType}x${count}`;
          const seen = (this.__stableShaderBufferCounts ??= Object.create(null));
          const ordinal = seen[stable] ?? 0;
          seen[stable] = ordinal + 1;
          if (ordinal === 0) {
            uniformNode.name = `buffer_${stable}`;
            node.name = `NodeBuffer_${stable}`;
          }
        }
      }
      return uniformNode;
    };
  }
  const renderer = new Renderer(backend, { antialias: false, alpha: false });
  renderer.library = new StandardNodeLibrary();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  await renderer.init();
  renderer.setSize(960, 432);

  const scene = new Scene();
  scene.add(new AmbientLight(0x334455, 0.5));
  const cam = new PerspectiveCamera(75, 960 / 432, 0.1, 400);
  cam.position.set(0, 3, 20);
  cam.lookAt(0, 1, 0);

  const mat = new MeshStandardMaterial({ color: 0x884422, roughness: 0.6 });
  mat.name = 'instProbe';
  const geo1 = new BoxGeometry(1, 2, 1);
  const geo2 = new BoxGeometry(1.2, 2, 1.2);
  const counts = [16, 16];
  for (let m = 0; m < 2; m += 1) {
    const mesh = new InstancedMesh(m === 0 ? geo1 : geo2, mat, counts[m]);
    const m4 = new Matrix4();
    for (let i = 0; i < counts[m]; i += 1) {
      m4.setPosition((i % 8) - 3.5 + m * 4, 1, Math.floor(i / 8) - 0.5);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  const scenePass = pass(scene, cam);
  scenePass.setMRT(mrt({ output, normal: normalView, wetRoadMask: float(0) }));
  const pipeline = new RenderPipeline(renderer, renderOutput(scenePass));
  await renderer.compileAsync(scene, cam);
  pipeline.render();
  renderer.render(scene, cam);
  const codes = new Set(
    [...renderer._pipelines.programs.vertex.values()]
      .filter((st) => st.name === 'instProbe')
      .map((st) => st.code),
  );
  const sample = [...codes][0] ?? '';
  const bufferNames = sample ? sample.match(/NodeBuffer_[A-Za-z0-9_]+/g) : [];
  console.log(
    `instance probe PATCH=${patched ? 1 : 0}: vertex codes = ${codes.size} (buffer names: ${[...new Set(bufferNames || [])].join(', ')})`,
  );
}
