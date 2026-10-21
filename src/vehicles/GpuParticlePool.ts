import {
  AdditiveBlending,
  type Blending,
  Color,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  NormalBlending,
  PlaneGeometry,
  Vector3,
} from 'three';
import {
  MeshBasicNodeMaterial,
  StorageInstancedBufferAttribute,
  type UniformNode,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  attribute,
  cameraProjectionMatrix,
  cameraViewMatrix,
  cos,
  exp,
  float,
  Fn,
  instanceIndex,
  mix,
  positionGeometry,
  select,
  sin,
  smoothstep,
  storage,
  texture as sampleTexture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import type { Vec3 } from '../shared/vector';

export interface ParticleSpawn {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly lifetime: number;
  readonly startSizeX: number;
  readonly endSizeX: number;
  readonly startSizeY: number;
  readonly endSizeY: number;
  readonly opacity: number;
  /** sRGB hex input; converted to linear when the spawn payload is uploaded. */
  readonly color: number;
  readonly roll: number;
  readonly fadeInSeconds: number;
}

type ComputeNodeLike = Extract<
  Parameters<WebGPURenderer['compute']>[0],
  { readonly isComputeNode: boolean }
>;

/**
 * Fixed-capacity GPU particle storage and compute update. The CPU only writes emitter spawn requests;
 * integration, lifetime, rebasing, size interpolation, billboarding and alpha are GPU-side on WebGPU.
 * WebGL2 never dispatches this node and the corresponding meshes stay hidden.
 */
export class GpuParticlePool {
  readonly mesh: InstancedMesh;
  readonly capacity: number;
  readonly computeNode: ComputeNodeLike;

  readonly #positionAge: StorageInstancedBufferAttribute;
  readonly #velocityLife: StorageInstancedBufferAttribute;
  readonly #sizes: StorageInstancedBufferAttribute;
  readonly #appearance: StorageInstancedBufferAttribute;
  readonly #style: StorageInstancedBufferAttribute;
  readonly #alpha: StorageInstancedBufferAttribute;
  readonly #spawnPosition: StorageInstancedBufferAttribute;
  readonly #spawnVelocity: StorageInstancedBufferAttribute;
  readonly #spawnSizes: StorageInstancedBufferAttribute;
  readonly #spawnAppearance: StorageInstancedBufferAttribute;
  readonly #spawnStyle: StorageInstancedBufferAttribute;
  readonly #spawnColor = new Color();

  readonly #delta = uniform(0);
  readonly #verticalAcceleration = uniform(0);
  readonly #dragPerSecond = uniform(0);
  readonly #originShift = uniform(new Vector3());

  #cursor = 0;
  #spawnRequests = 0;
  #spawnDirty = false;
  readonly #spawnedSlots: number[] = [];
  #pendingShiftX = 0;
  #pendingShiftZ = 0;
  #disposed = false;

  constructor(
    name: string,
    capacity: number,
    texture: DataTexture,
    blending: Blending,
    opacityScale = 1,
    renderOrder = 10,
  ) {
    this.capacity = Math.max(1, Math.floor(capacity));
    const geometry = new PlaneGeometry(1, 1);

    this.#positionAge = createStorageAttribute(this.capacity, 4);
    this.#velocityLife = createStorageAttribute(this.capacity, 4);
    this.#sizes = createStorageAttribute(this.capacity, 4);
    this.#appearance = createStorageAttribute(this.capacity, 4);
    this.#style = createStorageAttribute(this.capacity, 4);
    this.#alpha = createStorageAttribute(this.capacity, 1);
    this.#spawnPosition = createStorageAttribute(this.capacity, 4);
    this.#spawnVelocity = createStorageAttribute(this.capacity, 4);
    this.#spawnSizes = createStorageAttribute(this.capacity, 4);
    this.#spawnAppearance = createStorageAttribute(this.capacity, 4);
    this.#spawnStyle = createStorageAttribute(this.capacity, 4);

    geometry.setAttribute('particleColor', this.#appearance);
    geometry.setAttribute('particleOpacity', this.#alpha);

    const sprite = sampleTexture(texture, uv());
    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending,
      toneMapped: blending !== AdditiveBlending,
    });
    material.colorNode = vec4(attribute('particleColor', 'vec4').rgb.mul(sprite.rgb), float(1));
    material.opacityNode = attribute('particleOpacity', 'float').mul(sprite.a).mul(opacityScale);
    material.vertexNode = createParticleVertexNode(
      this.#positionAge,
      this.#velocityLife,
      this.#sizes,
      this.#style,
      this.capacity,
    );

    this.mesh = new InstancedMesh(geometry, material, this.capacity);
    this.mesh.name = name;
    this.mesh.count = this.capacity;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;

    this.computeNode = createParticleComputeNode(
      {
        positionAge: this.#positionAge,
        velocityLife: this.#velocityLife,
        sizes: this.#sizes,
        appearance: this.#appearance,
        style: this.#style,
        alpha: this.#alpha,
        spawnPosition: this.#spawnPosition,
        spawnVelocity: this.#spawnVelocity,
        spawnSizes: this.#spawnSizes,
        spawnAppearance: this.#spawnAppearance,
        spawnStyle: this.#spawnStyle,
        delta: this.#delta,
        verticalAcceleration: this.#verticalAcceleration,
        dragPerSecond: this.#dragPerSecond,
        originShift: this.#originShift,
      },
      this.capacity,
      name,
    );
  }

  get spawnRequests(): number {
    return this.#spawnRequests;
  }

  spawn(spawn: ParticleSpawn): void {
    if (this.#disposed) {
      return;
    }
    const slot = this.#cursor;
    this.#cursor = (this.#cursor + 1) % this.capacity;
    const offset = slot * 4;

    this.#spawnPosition.array.set(
      [spawn.position.x, spawn.position.y, spawn.position.z, 1],
      offset,
    );
    this.#spawnVelocity.array.set(
      [spawn.velocity.x, spawn.velocity.y, spawn.velocity.z, spawn.lifetime],
      offset,
    );
    this.#spawnSizes.array.set(
      [spawn.startSizeX, spawn.endSizeX, spawn.startSizeY, spawn.endSizeY],
      offset,
    );
    this.#spawnColor.setHex(spawn.color);
    this.#spawnAppearance.array.set(
      [this.#spawnColor.r, this.#spawnColor.g, this.#spawnColor.b, spawn.opacity],
      offset,
    );
    this.#spawnStyle.array.set([spawn.roll, spawn.fadeInSeconds, 0, 0], offset);
    this.#spawnedSlots.push(slot);
    this.#spawnRequests += 1;
    this.#spawnDirty = true;
  }

  beginFrame(): void {
    this.#spawnRequests = 0;
  }

  prepareCompute(delta: number, verticalAcceleration: number, dragPerSecond: number): void {
    this.#delta.value = delta;
    this.#verticalAcceleration.value = verticalAcceleration;
    this.#dragPerSecond.value = dragPerSecond;
    this.#originShift.value.set(this.#pendingShiftX, 0, this.#pendingShiftZ);

    if (this.#spawnDirty) {
      this.#spawnPosition.needsUpdate = true;
      this.#spawnVelocity.needsUpdate = true;
      this.#spawnSizes.needsUpdate = true;
      this.#spawnAppearance.needsUpdate = true;
      this.#spawnStyle.needsUpdate = true;
    }
  }

  finishCompute(): void {
    // The compute kernel consumed each flag in the GPU buffer. Clear the matching CPU mirrors
    // without re-uploading them; the next upload should only carry fresh spawn requests.
    for (const slot of this.#spawnedSlots) {
      this.#spawnPosition.array[slot * 4 + 3] = 0;
    }
    this.#spawnedSlots.length = 0;
    this.#spawnDirty = false;
    this.#pendingShiftX = 0;
    this.#pendingShiftZ = 0;
    this.#originShift.value.set(0, 0, 0);
  }

  setComputeEnabled(enabled: boolean): void {
    this.mesh.visible = enabled;
  }

  /** Existing GPU particles move with the simulation origin; no state is read back to the CPU. */
  shiftBy(dx: number, dz: number): void {
    this.#pendingShiftX += dx;
    this.#pendingShiftZ += dz;
  }

  reset(): void {
    this.#cursor = 0;
    this.#spawnRequests = 0;
    this.#spawnDirty = false;
    this.#spawnedSlots.length = 0;
    this.#pendingShiftX = 0;
    this.#pendingShiftZ = 0;
    for (const attribute of [
      this.#positionAge,
      this.#velocityLife,
      this.#sizes,
      this.#appearance,
      this.#style,
      this.#alpha,
      this.#spawnPosition,
      this.#spawnVelocity,
      this.#spawnSizes,
      this.#spawnAppearance,
      this.#spawnStyle,
    ]) {
      attribute.array.fill(0);
      attribute.needsUpdate = true;
    }
    this.#originShift.value.set(0, 0, 0);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.computeNode.dispose();
    this.mesh.geometry.dispose();
    const material = this.mesh.material;
    if (!Array.isArray(material)) {
      material.dispose();
    }
    this.mesh.removeFromParent();
  }
}

function createStorageAttribute(
  capacity: number,
  itemSize: number,
): StorageInstancedBufferAttribute {
  const attribute = new StorageInstancedBufferAttribute(
    new Float32Array(capacity * itemSize),
    itemSize,
  );
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}

interface ParticleComputeBuffers {
  readonly positionAge: StorageInstancedBufferAttribute;
  readonly velocityLife: StorageInstancedBufferAttribute;
  readonly sizes: StorageInstancedBufferAttribute;
  readonly appearance: StorageInstancedBufferAttribute;
  readonly style: StorageInstancedBufferAttribute;
  readonly alpha: StorageInstancedBufferAttribute;
  readonly spawnPosition: StorageInstancedBufferAttribute;
  readonly spawnVelocity: StorageInstancedBufferAttribute;
  readonly spawnSizes: StorageInstancedBufferAttribute;
  readonly spawnAppearance: StorageInstancedBufferAttribute;
  readonly spawnStyle: StorageInstancedBufferAttribute;
  readonly delta: UniformNode<'float', number>;
  readonly verticalAcceleration: UniformNode<'float', number>;
  readonly dragPerSecond: UniformNode<'float', number>;
  readonly originShift: UniformNode<'vec3', Vector3>;
}

function createParticleComputeNode(
  buffers: ParticleComputeBuffers,
  capacity: number,
  name: string,
): ComputeNodeLike {
  const positionAge = storage(buffers.positionAge, 'vec4', capacity);
  const velocityLife = storage(buffers.velocityLife, 'vec4', capacity);
  const sizes = storage(buffers.sizes, 'vec4', capacity);
  const appearance = storage(buffers.appearance, 'vec4', capacity);
  const style = storage(buffers.style, 'vec4', capacity);
  const alpha = storage(buffers.alpha, 'float', capacity);
  const spawnPosition = storage(buffers.spawnPosition, 'vec4', capacity);
  const spawnVelocity = storage(buffers.spawnVelocity, 'vec4', capacity);
  const spawnSizes = storage(buffers.spawnSizes, 'vec4', capacity);
  const spawnAppearance = storage(buffers.spawnAppearance, 'vec4', capacity);
  const spawnStyle = storage(buffers.spawnStyle, 'vec4', capacity);

  return Fn(() => {
    const oldPositionAge = positionAge.element(instanceIndex).toVar();
    const oldVelocityLife = velocityLife.element(instanceIndex).toVar();
    const oldSizes = sizes.element(instanceIndex).toVar();
    const oldAppearance = appearance.element(instanceIndex).toVar();
    const oldStyle = style.element(instanceIndex).toVar();

    const requestedPosition = spawnPosition.element(instanceIndex).toVar();
    const requestedVelocity = spawnVelocity.element(instanceIndex).toVar();
    const requestedSizes = spawnSizes.element(instanceIndex).toVar();
    const requestedAppearance = spawnAppearance.element(instanceIndex).toVar();
    const requestedStyle = spawnStyle.element(instanceIndex).toVar();
    const isSpawn = requestedPosition.w.greaterThan(0.5);
    const wasAlive = oldVelocityLife.w
      .greaterThan(0)
      .and(oldPositionAge.w.lessThan(oldVelocityLife.w));
    const nextAge = oldPositionAge.w.add(buffers.delta);
    const remainsAlive = wasAlive.and(nextAge.lessThan(oldVelocityLife.w));

    const drag = exp(buffers.dragPerSecond.mul(buffers.delta).negate());
    const advancedVelocity = vec3(
      oldVelocityLife.x,
      oldVelocityLife.y.add(buffers.verticalAcceleration.mul(buffers.delta)),
      oldVelocityLife.z,
    ).mul(drag);
    const advancedPosition = oldPositionAge.xyz
      .add(advancedVelocity.mul(buffers.delta))
      .sub(buffers.originShift);

    const outputPosition = select(
      isSpawn,
      requestedPosition.xyz,
      select(remainsAlive, advancedPosition, vec3(0, 0, 0)),
    );
    const outputAge = select(isSpawn, float(0), select(remainsAlive, nextAge, float(0)));
    const outputVelocity = select(
      isSpawn,
      requestedVelocity.xyz,
      select(remainsAlive, advancedVelocity, vec3(0, 0, 0)),
    );
    const outputLifetime = select(
      isSpawn,
      requestedVelocity.w,
      select(remainsAlive, oldVelocityLife.w, float(0)),
    );
    const outputSizes = select(
      isSpawn,
      requestedSizes,
      select(remainsAlive, oldSizes, vec4(0, 0, 0, 0)),
    );
    const outputAppearance = select(
      isSpawn,
      requestedAppearance,
      select(remainsAlive, oldAppearance, vec4(0, 0, 0, 0)),
    );
    const outputStyle = select(
      isSpawn,
      requestedStyle,
      select(remainsAlive, oldStyle, vec4(0, 0, 0, 0)),
    );

    positionAge.element(instanceIndex).assign(vec4(outputPosition, outputAge));
    velocityLife.element(instanceIndex).assign(vec4(outputVelocity, outputLifetime));
    sizes.element(instanceIndex).assign(outputSizes);
    appearance.element(instanceIndex).assign(outputAppearance);
    style.element(instanceIndex).assign(outputStyle);

    // The request flag is consumed on-GPU. The CPU buffer only changes again when a slot is reused.
    spawnPosition.element(instanceIndex).assign(vec4(requestedPosition.xyz, float(0)));

    const active = isSpawn.or(remainsAlive);
    const alphaAge = select(isSpawn, float(0), select(remainsAlive, nextAge, float(0)));
    const alphaLifetime = select(
      isSpawn,
      requestedVelocity.w,
      select(remainsAlive, oldVelocityLife.w, float(1)),
    );
    const alphaOpacity = select(
      isSpawn,
      requestedAppearance.w,
      select(remainsAlive, oldAppearance.w, float(0)),
    );
    const alphaStyle = select(
      isSpawn,
      requestedStyle,
      select(remainsAlive, oldStyle, vec4(0, 0, 0, 0)),
    );
    const lifeProgress = alphaAge.div(alphaLifetime.max(float(0.0001))).clamp(0, 1);
    const fadeIn = smoothstep(float(0), alphaStyle.y.max(float(0.0001)), alphaAge);
    const fadeOut = float(1).sub(smoothstep(float(0.55), float(1), lifeProgress));
    alpha
      .element(instanceIndex)
      .assign(select(active, alphaOpacity.mul(fadeIn).mul(fadeOut), float(0)));
  })()
    .compute(capacity, [64])
    .setName(`GpuParticles.${name}`);
}

function createParticleVertexNode(
  positionAgeAttribute: StorageInstancedBufferAttribute,
  velocityLifeAttribute: StorageInstancedBufferAttribute,
  sizesAttribute: StorageInstancedBufferAttribute,
  styleAttribute: StorageInstancedBufferAttribute,
  capacity: number,
) {
  const positionAge = storage(positionAgeAttribute, 'vec4', capacity).toReadOnly();
  const velocityLife = storage(velocityLifeAttribute, 'vec4', capacity).toReadOnly();
  const sizes = storage(sizesAttribute, 'vec4', capacity).toReadOnly();
  const style = storage(styleAttribute, 'vec4', capacity).toReadOnly();

  return Fn(() => {
    const positionAgeValue = positionAge.element(instanceIndex);
    const velocityLifeValue = velocityLife.element(instanceIndex);
    const sizeValue = sizes.element(instanceIndex);
    const styleValue = style.element(instanceIndex);
    const lifeProgress = positionAgeValue.w.div(velocityLifeValue.w.max(float(0.0001))).clamp(0, 1);
    const sizeProgress = smoothstep(float(0), float(1), lifeProgress);
    const sizeX = mix(sizeValue.x, sizeValue.y, sizeProgress);
    const sizeY = mix(sizeValue.z, sizeValue.w, sizeProgress);
    const rollCos = cos(styleValue.x);
    const rollSin = sin(styleValue.x);
    const local = vec2(positionGeometry.x.mul(sizeX), positionGeometry.y.mul(sizeY));
    const rolled = vec2(
      local.x.mul(rollCos).sub(local.y.mul(rollSin)),
      local.x.mul(rollSin).add(local.y.mul(rollCos)),
    );
    const view = cameraViewMatrix.mul(vec4(positionAgeValue.xyz, 1)).xyz;
    const viewPosition = view.add(vec3(rolled, float(0)));
    return cameraProjectionMatrix.mul(vec4(viewPosition, 1));
  })();
}
