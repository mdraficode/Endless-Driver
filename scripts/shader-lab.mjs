/**
 * Shader lab: run three's WebGPU common renderer with a stub backend on Node, so the full
 * TSL code generation (the part that costs the phone 81 s of GPU compile) can be reproduced
 * offline in milliseconds. Captures every generated stage (code + name) from
 * `renderer._pipelines.programs` — the same registry the device inventory reads.
 *
 * Usage: node scripts/shader-lab.mjs
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

const main = async () => {
  console.log('lab: building renderer');
  const renderer = await buildRenderer();
  console.log('lab: renderer ready, shadowMap', renderer.shadowMap.enabled);
  const { scene, texArrivals } = shadowMixScene();
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
  }
  console.log(
    `lab: rendered ${frames} frames; ShadowMaterial fragment variants per frame: ${counts.join(',')}`,
  );

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
