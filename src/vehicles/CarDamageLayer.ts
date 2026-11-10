import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Material,
} from 'three';

import type { CarDamageMap, CarDamagePart, CarDamagePartState } from './CarDamage';
import { CAR_DAMAGE_PARTS } from './CarDamage';

/**
 * Phase 12.3 — persistent damage presentation as an overlay layer.
 *
 * The hero model is a merged mesh with no per-part nodes, so damage is rendered as
 * car-local overlay decals (crack/dent/shatter quads) parented to the visual root.
 * The same layer works on the authored fallback and the hero variant because both
 * share the car envelope. Overlays update only when a part's discrete state changes.
 *
 * Textures are procedural (seeded canvas) — original, project-owned, no external
 * assets. In headless environments (no canvas) the layer degrades to plain tinted
 * quads so the state logic remains testable.
 */

type Position3 = readonly [number, number, number];
type Orientation3 = readonly [number, number, number];

interface OverlaySpec {
  readonly size: readonly [number, number];
  readonly position: Position3;
  /** Euler rotation (rad) pointing the quad at the panel it decals. */
  readonly rotation: Orientation3;
  /** Pushed slightly off the surface to avoid z-fighting (car-local metres). */
  readonly offset: readonly [number, number, number];
}

const OVERLAYS: Record<
  'windshield' | 'hood' | 'frontBumper' | 'rearBumper' | 'doorLeft' | 'doorRight',
  OverlaySpec
> = {
  // Car frame: +x left, +y up, -z ahead.
  windshield: {
    size: [1.14, 0.52],
    position: [0, 0.55, -0.32],
    rotation: [-0.46, 0, 0],
    offset: [0, 0, -0.015],
  },
  hood: {
    size: [0.72, 1.05],
    position: [0, 0.345, -1.13],
    rotation: [-Math.PI / 2, 0, 0],
    offset: [0, 0.012, 0],
  },
  frontBumper: {
    size: [1.25, 0.34],
    position: [0, 0.17, -2.03],
    rotation: [0, Math.PI, 0],
    offset: [0, 0, -0.02],
  },
  rearBumper: {
    size: [1.25, 0.34],
    position: [0, 0.2, 2.035],
    rotation: [0, 0, 0],
    offset: [0, 0, 0.02],
  },
  doorLeft: {
    size: [1.05, 0.42],
    position: [0.845, 0.33, 0.38],
    rotation: [0, Math.PI / 2, 0],
    offset: [0.015, 0, 0],
  },
  doorRight: {
    size: [1.05, 0.42],
    position: [-0.845, 0.33, 0.38],
    rotation: [0, -Math.PI / 2, 0],
    offset: [-0.015, 0, 0],
  },
};

const LAMP_OVERLAYS: Record<
  'lampFrontLeft' | 'lampFrontRight' | 'lampRearLeft' | 'lampRearRight',
  OverlaySpec
> = {
  lampFrontLeft: {
    size: [0.36, 0.14],
    position: [0.55, 0.24, -2.035],
    rotation: [0, Math.PI, 0],
    offset: [0, 0, -0.018],
  },
  lampFrontRight: {
    size: [0.36, 0.14],
    position: [-0.55, 0.24, -2.035],
    rotation: [0, Math.PI, 0],
    offset: [0, 0, -0.018],
  },
  lampRearLeft: {
    size: [0.32, 0.11],
    position: [0.56, 0.19, 2.045],
    rotation: [0, 0, 0],
    offset: [0, 0, 0.018],
  },
  lampRearRight: {
    size: [0.32, 0.11],
    position: [-0.56, 0.19, 2.045],
    rotation: [0, 0, 0],
    offset: [0, 0, 0.018],
  },
};

/** Deterministic PRNG (mulberry32) so the crack patterns are stable across runs. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DamageTextures {
  readonly crackedGlass: CanvasTexture | null;
  readonly shatteredGlass: CanvasTexture | null;
  readonly dent: CanvasTexture | null;
  readonly bruise: CanvasTexture | null;
}

function createDamageTextures(): DamageTextures {
  if (typeof document === 'undefined' || document.createElement === undefined) {
    return { crackedGlass: null, shatteredGlass: null, dent: null, bruise: null };
  }

  const make = (draw: (ctx: CanvasRenderingContext2D, size: number) => void, size: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;
    draw(ctx, size);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  };

  const crackedGlass = make((ctx, size) => {
    const rand = mulberry32(20261110);
    ctx.strokeStyle = 'rgba(235, 244, 255, 0.9)';
    ctx.lineWidth = 1.6;
    const cx = size * 0.46;
    const cy = size * 0.42;
    for (let i = 0; i < 9; i += 1) {
      const angle = rand() * Math.PI * 2;
      const length = size * (0.3 + rand() * 0.4);
      let x = cx;
      let y = cy;
      let a = angle;
      for (let step = 0; step < 5; step += 1) {
        const seg = length / 5;
        const nx = x + Math.cos(a) * seg;
        const ny = y + Math.sin(a) * seg;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        // Secondary branch.
        if (rand() < 0.6) {
          const ba = a + (rand() - 0.5) * 1.4;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(ba) * seg * 0.5, y + Math.sin(ba) * seg * 0.5);
          ctx.stroke();
        }
        x = nx;
        y = ny;
        a += (rand() - 0.5) * 0.9;
      }
    }
  }, 256);

  const shatteredGlass = make((ctx, size) => {
    const rand = mulberry32(777);
    ctx.strokeStyle = 'rgba(210, 225, 245, 0.75)';
    for (let i = 0; i < 46; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const angle = rand() * Math.PI * 2;
      const length = size * (0.08 + rand() * 0.22);
      ctx.lineWidth = 0.8 + rand();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    }
    // A few dark holes where the glass is gone.
    ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
    for (let i = 0; i < 7; i += 1) {
      const x = size * (0.2 + rand() * 0.6);
      const y = size * (0.2 + rand() * 0.6);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let v = 0; v < 6; v += 1) {
        const a = (v / 6) * Math.PI * 2;
        const r = 3 + rand() * 7;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
  }, 256);

  const dent = make((ctx, size) => {
    const rand = mulberry32(4242);
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(18, 20, 26, 0.75)');
    gradient.addColorStop(0.55, 'rgba(28, 31, 38, 0.45)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    // Crease strokes around the impact.
    ctx.strokeStyle = 'rgba(8, 9, 12, 0.5)';
    for (let i = 0; i < 5; i += 1) {
      const a = rand() * Math.PI * 2;
      const r = size * (0.18 + rand() * 0.2);
      ctx.lineWidth = 1 + rand() * 1.5;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r, a, a + 0.8 + rand());
      ctx.stroke();
    }
  }, 128);

  const bruise = make((ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(12, 13, 17, 0.9)');
    gradient.addColorStop(0.6, 'rgba(16, 18, 23, 0.6)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }, 128);

  return { crackedGlass, shatteredGlass, dent, bruise };
}

function createOverlayMaterial(
  color: number,
  texture: CanvasTexture | null,
  opacity: number,
): Material {
  const material = new MeshBasicMaterial({
    color: new Color(color),
    map: texture ?? null,
    transparent: true,
    opacity,
    side: DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.name = 'car-damage-overlay';
  return material;
}

export interface CarDamageLayerStats {
  /** Number of discrete state applications (0 when nothing changed). */
  appliedUpdates: number;
}

export class CarDamageLayer {
  readonly root = new Group();
  readonly stats: CarDamageLayerStats = { appliedUpdates: 0 };

  readonly #materials: Material[] = [];
  #geometries: PlaneGeometry[] = [];
  #panelMeshes = new Map<string, Mesh>();
  #lampMeshes = new Map<CarDamagePart, Mesh>();
  #lastState = new Map<CarDamagePart, CarDamagePartState>();
  #textures: DamageTextures;
  #disposed = false;

  constructor() {
    this.root.name = 'car-damage-layer';
    this.#textures = createDamageTextures();
    const textures = this.#textures;

    for (const [part, spec] of Object.entries(OVERLAYS) as Array<
      [keyof typeof OVERLAYS, OverlaySpec]
    >) {
      const isGlass = part === 'windshield';
      const material = createOverlayMaterial(
        isGlass ? 0xbfd4e6 : 0x2a2e38,
        isGlass ? textures.crackedGlass : textures.dent,
        0.7,
      );
      this.#materials.push(material);
      const geometry = new PlaneGeometry(spec.size[0], spec.size[1]);
      this.#geometries.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.name = `car-damage-${part}`;
      mesh.position.set(
        spec.position[0] + spec.offset[0],
        spec.position[1] + spec.offset[1],
        spec.position[2] + spec.offset[2],
      );
      mesh.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
      mesh.visible = false;
      mesh.renderOrder = 20;
      this.root.add(mesh);
      this.#panelMeshes.set(part, mesh);
      this.#lastState.set(part as CarDamagePart, 'intact');
    }

    for (const [part, spec] of Object.entries(LAMP_OVERLAYS) as Array<
      [keyof typeof LAMP_OVERLAYS, OverlaySpec]
    >) {
      const material = createOverlayMaterial(0x05060a, null, 0.92);
      this.#materials.push(material);
      const geometry = new PlaneGeometry(spec.size[0], spec.size[1]);
      this.#geometries.push(geometry);
      const mesh = new Mesh(geometry, material);
      mesh.name = `car-damage-${part}`;
      mesh.position.set(
        spec.position[0] + spec.offset[0],
        spec.position[1] + spec.offset[1],
        spec.position[2] + spec.offset[2],
      );
      mesh.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
      mesh.visible = false;
      mesh.renderOrder = 20;
      this.root.add(mesh);
      this.#lampMeshes.set(part, mesh);
      this.#lastState.set(part, 'intact');
    }
  }

  /**
   * Applies the full damage map. Only parts whose discrete state changed touch the
   * scene graph, so per-frame cost is zero while nothing changes.
   */
  applyAll(damage: CarDamageMap): void {
    if (this.#disposed) return;
    for (const part of CAR_DAMAGE_PARTS) {
      const record = damage[part];
      const before = this.#lastState.get(part) ?? 'intact';
      if (before === record.state) continue;
      this.#lastState.set(part, record.state);
      this.#applyPart(part, record.state, record.severity);
      this.stats.appliedUpdates += 1;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const geometry of this.#geometries) geometry.dispose();
    for (const material of this.#materials) material.dispose();
    this.root.clear();
  }

  #applyPart(part: CarDamagePart, state: CarDamagePartState, severity: number): void {
    const mesh = this.#panelMeshes.get(part) ?? this.#lampMeshes.get(part);
    if (mesh === undefined || mesh === null) return;
    const material = mesh.material as MeshBasicMaterial;
    if (state === 'intact') {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    if (part === 'windshield') {
      // Cracked: fine radial cracks; destroyed: shatter pattern with dark holes.
      const texture =
        state === 'destroyed' ? this.#textures.shatteredGlass : this.#textures.crackedGlass;
      if (texture !== null) material.map = texture;
      material.needsUpdate = true;
      material.opacity = state === 'destroyed' ? 0.85 : 0.55 + 0.35 * Math.min(1, severity / 0.5);
      return;
    }
    if (part.startsWith('lamp')) {
      // Destroyed lamp: the quad hides the lens; the emissive blackout is applied
      // by PlayerCarVisual on the tracked lamp materials.
      material.opacity = state === 'destroyed' ? 0.95 : 0.4;
      return;
    }
    // Panels: a dent grows with severity; destroyed swaps to a darker bruise.
    material.opacity = state === 'destroyed' ? 0.85 : 0.45 + 0.5 * Math.min(1, severity / 0.5);
    if (state === 'destroyed') {
      const bruise = this.#textures.bruise;
      if (bruise !== null) {
        material.map = bruise;
        material.needsUpdate = true;
      }
    }
  }
}
