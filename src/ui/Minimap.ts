/**
 * The minimap — a heading-up canvas HUD showing the ground around the car,
 * the road and trail networks, the prefecture's named places, and an edge
 * arrow pointing at the next point of interest with its distance (owner
 * request, 2026-10-18).
 *
 * Two layers, deliberately split by cost:
 *  - a static base map, rasterised once (a little after first frame) from the
 *    same terrain colour function the chunk vertex colours use, plus the road
 *    and trail polylines and district labels. 192² samples over ±1500 m.
 *  - a per-frame overlay (throttled to ~10 Hz) that rotates the base under the
 *    car's heading and draws the car, POI diamonds and the target arrow.
 *
 * "Next" POI is the nearest unvisited place; driving inside its radius visits
 * it. Tapping (or clicking) the map cycles the target by hand.
 */
import { ROAD_NETWORK_CONFIG } from '../config/roads';
import { POINTS_OF_INTEREST, type PointOfInterest } from '../config/pois';
import { trailPolylines } from '../world/trails';
import {
  terrainColorAt,
  terrainPatchAt,
  terrainVariationAt,
  type TerrainSampler,
} from '../world/terrain-height';
import { groundTintAt } from '../world/districts';

/** Linear albedo -> sRGB byte, held at 88% so HUD ink stays the brightest thing. */
function linearToByte(value: number): number {
  const c = Math.min(1, Math.max(0, value));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(s * 255 * 0.88);
}

const WORLD_HALF = 1500;
const BASE_PX = 320;
const VIEW_METERS = 560;
const REDRAW_MS = 100;

export interface MinimapPose {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface MinimapOptions {
  readonly sampler: TerrainSampler;
  readonly getPose: () => MinimapPose;
  readonly parent?: HTMLElement;
  /** CSS size in pixels; the backing store is doubled for sharpness. */
  readonly sizeCss?: number;
}

export class Minimap {
  readonly canvas: HTMLCanvasElement;

  readonly #sampler: TerrainSampler;
  readonly #getPose: () => MinimapPose;
  readonly #size: number;
  readonly #base: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #visited = new Set<string>();
  #targetIndex = -1;
  #lastRedraw = 0;
  #baseReady = false;
  #frameHandle = 0;
  #disposed = false;

  constructor(options: MinimapOptions) {
    this.#sampler = options.sampler;
    this.#getPose = options.getPose;
    this.#size = options.sizeCss ?? 168;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.#size * 2;
    this.canvas.height = this.#size * 2;
    this.canvas.style.position = 'fixed';
    this.canvas.style.left = '10px';
    this.canvas.style.top = '10px';
    this.canvas.style.width = `${this.#size}px`;
    this.canvas.style.height = `${this.#size}px`;
    this.canvas.style.borderRadius = '12px';
    this.canvas.style.background = 'rgba(8, 12, 10, 0.62)';
    this.canvas.style.border = '1px solid rgba(255, 255, 255, 0.22)';
    this.canvas.style.zIndex = '40';
    this.canvas.style.touchAction = 'none';
    this.canvas.style.cursor = 'pointer';
    this.canvas.setAttribute('aria-label', 'Minimap: tap to cycle the next destination');
    this.canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.cycleTarget();
    });
    (options.parent ?? document.body).appendChild(this.canvas);

    this.#base = document.createElement('canvas');
    this.#base.width = BASE_PX;
    this.#base.height = BASE_PX;
    const ctx = this.canvas.getContext('2d');
    if (ctx === null) {
      throw new Error('minimap: 2d context unavailable');
    }
    this.#ctx = ctx;
    this.#pickNearestTarget();
    this.#frameHandle = requestAnimationFrame(this.#tick);
    // The base map is a few hundred thousand height samples: build it a beat
    // after the first frame so boot never waits on the HUD.
    window.setTimeout(() => this.#buildBase(), 400);
  }

  dispose(): void {
    this.#disposed = true;
    cancelAnimationFrame(this.#frameHandle);
    this.canvas.remove();
  }

  /** Cycles the navigation target by hand; returns the newly selected POI. */
  cycleTarget(): PointOfInterest {
    this.#targetIndex = (this.#targetIndex + 1) % POINTS_OF_INTEREST.length;
    return POINTS_OF_INTEREST[this.#targetIndex]!;
  }

  get target(): PointOfInterest | null {
    return this.#targetIndex >= 0 ? (POINTS_OF_INTEREST[this.#targetIndex] ?? null) : null;
  }

  #pickNearestTarget(): void {
    const pose = this.#getPose();
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < POINTS_OF_INTEREST.length; i += 1) {
      const poi = POINTS_OF_INTEREST[i]!;
      if (this.#visited.has(poi.id)) {
        continue;
      }
      const distance = Math.hypot(poi.x - pose.x, poi.z - pose.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    if (best < 0) {
      // Every place visited: the prefecture is small, so start again.
      this.#visited.clear();
      this.#pickNearestTarget();
      return;
    }
    this.#targetIndex = best;
  }

  /** Static layer: terrain macro colour + roads + trails + district labels. */
  #buildBase(): void {
    if (this.#disposed) return;
    const ctx = this.#base.getContext('2d', { willReadFrequently: false });
    if (ctx === null) return;
    const image = ctx.createImageData(BASE_PX, BASE_PX);
    const data = image.data;
    const step = (WORLD_HALF * 2) / BASE_PX;
    const { config } = this.#sampler;
    for (let j = 0; j < BASE_PX; j += 1) {
      for (let i = 0; i < BASE_PX; i += 1) {
        const x = -WORLD_HALF + (i + 0.5) * step;
        const z = -WORLD_HALF + (j + 0.5) * step;
        const height = this.#sampler.heightAt(x, z);
        const normal = this.#sampler.normalAt(x, z);
        const variation = terrainVariationAt(config, x, z);
        const patch = terrainPatchAt(config, x, z);
        const color = terrainColorAt(
          config,
          height,
          1 - normal.y,
          variation,
          1,
          groundTintAt(x, z),
          patch,
        );
        const index = (j * BASE_PX + i) * 4;
        // The macro tint is a linear albedo; convert to sRGB so the map reads
        // like the ground looks, then hold it a touch dark for HUD contrast.
        data[index] = linearToByte(color[0]);
        data[index + 1] = linearToByte(color[1]);
        data[index + 2] = linearToByte(color[2]);
        data[index + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);

    const toPx = (x: number, z: number): [number, number] => [
      ((x + WORLD_HALF) / (WORLD_HALF * 2)) * BASE_PX,
      ((z + WORLD_HALF) / (WORLD_HALF * 2)) * BASE_PX,
    ];
    // Roads: pale asphalt ribbons at map scale.
    ctx.strokeStyle = 'rgba(214, 210, 198, 0.92)';
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    for (const edge of this.#sampler.roadNetwork?.edges ?? []) {
      ctx.beginPath();
      edge.points.forEach((point, index) => {
        const [px, py] = toPx(point.x, point.z);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    // Trails: dashed worn earth, thinner than roads — off-road reads off-road.
    ctx.strokeStyle = 'rgba(176, 138, 92, 0.95)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 2.4]);
    for (const route of trailPolylines()) {
      ctx.beginPath();
      route.points.forEach(([x, z], index) => {
        const [px, py] = toPx(x, z);
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    this.#baseReady = true;
  }

  readonly #tick = (): void => {
    if (this.#disposed) return;
    this.#frameHandle = requestAnimationFrame(this.#tick);
    const now = performance.now();
    if (now - this.#lastRedraw < REDRAW_MS) return;
    this.#lastRedraw = now;
    this.#draw();
  };

  #draw(): void {
    const ctx = this.#ctx;
    const size = this.#size * 2;
    const centre = size / 2;
    const pose = this.#getPose();
    ctx.clearRect(0, 0, size, size);

    const zoom = size / VIEW_METERS; // px per world metre on the HUD
    const baseScale = BASE_PX / (WORLD_HALF * 2); // px per world metre on the base map

    if (this.#baseReady) {
      ctx.save();
      ctx.translate(centre, centre);
      ctx.rotate(pose.yaw);
      ctx.scale(zoom / baseScale, zoom / baseScale);
      const carPx = (pose.x + WORLD_HALF) * baseScale;
      const carPy = (pose.z + WORLD_HALF) * baseScale;
      ctx.drawImage(this.#base, -carPx, -carPy);
      ctx.restore();
    }

    // Soft round vignette so the square canvas reads as a scope.
    const vignette = ctx.createRadialGradient(
      centre,
      centre,
      size * 0.3,
      centre,
      centre,
      size * 0.5,
    );
    vignette.addColorStop(0, 'rgba(8, 12, 10, 0)');
    vignette.addColorStop(1, 'rgba(8, 12, 10, 0.78)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);

    const forwardX = -Math.sin(pose.yaw);
    const forwardZ = -Math.cos(pose.yaw);
    const rightX = Math.cos(pose.yaw);
    const rightZ = -Math.sin(pose.yaw);
    const toScreen = (x: number, z: number): [number, number] => {
      const dx = x - pose.x;
      const dz = z - pose.z;
      return [
        centre + (dx * rightX + dz * rightZ) * zoom,
        centre - (dx * forwardX + dz * forwardZ) * zoom,
      ];
    };

    // POI diamonds: visited dim, target bright, others quiet.
    for (let i = 0; i < POINTS_OF_INTEREST.length; i += 1) {
      const poi = POINTS_OF_INTEREST[i]!;
      const [sx, sy] = toScreen(poi.x, poi.z);
      if (sx < -20 || sy < -20 || sx > size + 20 || sy > size + 20) continue;
      const isTarget = i === this.#targetIndex;
      const visited = this.#visited.has(poi.id);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      const r = isTarget ? 7 : 5;
      ctx.fillStyle = isTarget
        ? 'rgba(255, 208, 96, 0.95)'
        : visited
          ? 'rgba(150, 160, 150, 0.5)'
          : 'rgba(235, 235, 225, 0.72)';
      ctx.fillRect(-r / 2, -r / 2, r, r);
      ctx.restore();
      // Labels live on the overlay (screen scale), never on the magnified base.
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = isTarget ? 'rgba(255, 236, 190, 0.9)' : 'rgba(255, 255, 255, 0.55)';
      ctx.textAlign = 'center';
      ctx.fillText(poi.label, sx, sy + 16);
    }

    // Visit check: any place the car stands in counts as visited (not just the
    // current target — driving through a district on the way somewhere else is
    // still having been there). Reaching the target retargets to the next one.
    let retarget = false;
    for (const poi of POINTS_OF_INTEREST) {
      if (this.#visited.has(poi.id)) continue;
      if (Math.hypot(poi.x - pose.x, poi.z - pose.z) < poi.radiusMeters) {
        this.#visited.add(poi.id);
        if (poi.id === this.target?.id) retarget = true;
      }
    }
    if (retarget) {
      this.#pickNearestTarget();
    }

    // Edge arrow + distance to the target, so "next" is always answered even
    // when the place is far outside the visible window.
    const current = this.target;
    if (current !== null) {
      const dx = current.x - pose.x;
      const dz = current.z - pose.z;
      const distance = Math.hypot(dx, dz);
      const sx = dx * rightX + dz * rightZ;
      const sy = -(dx * forwardX + dz * forwardZ);
      const len = Math.hypot(sx, sy) || 1;
      const arrowRadius = size * 0.42;
      const ax = centre + (sx / len) * arrowRadius;
      const ay = centre + (sy / len) * arrowRadius;
      const angle = Math.atan2(sy, sx);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.fillStyle = 'rgba(255, 208, 96, 0.95)';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-7, -7);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.font = '600 17px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 236, 190, 0.95)';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(distance / 10) * 10} m`, centre, size - 30);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.fillText(current.label, centre, size - 12);
    }

    // The car: a small heading-up wedge, always centred.
    ctx.save();
    ctx.translate(centre, centre);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Kept for callers that want the road width context beside the map scale. */
export const MINIMAP_ROAD_HALF_WIDTH = ROAD_NETWORK_CONFIG.halfWidthMeters;
