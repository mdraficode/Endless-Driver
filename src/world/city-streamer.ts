/**
 * Phase 10 — the massing-city streamer.
 *
 * The vast city beyond the home city is not built at load (that would cost the phone's
 * startup seconds): urban regions materialise as the player approaches and are released
 * when they leave. `MassingCityWorld` instances are bounded per tier, at most one is built
 * per frame (each build is a few instanced batches), and everything is deterministic per
 * seed — the same city always rises up at the same place.
 */
import { uniform } from 'three/tsl';
import type { UniformNode } from 'three/webgpu';
import { resolveUrbanNightGain } from '../config/urban-city';
import type { DaylightState } from '../environment/EnvironmentClock';
import type { TierId } from '../config/tiers';
import { ROAD_WINDOW_CELLS } from './road-layout';
import { massingCityForRegion, type MassingCitySpec } from './city-content';
import { MassingCityWorld } from './urban-massing';
import type { WorldPlan } from './world-plan';
import type { TownCarProbe, TownHit } from './town';
import type { TerrainSampler } from './terrain-height';

/** Regions closer than this are candidates; farther than the unbuild radius are released. */
const BUILD_RADIUS_METERS = 1800;
const UNBUILD_RADIUS_METERS = 2800;
const MAX_LIVE_CITIES: Readonly<Record<TierId, number>> = { A: 4, B: 3, C: 2 };

interface CandidateRegion {
  readonly regionId: string;
  readonly x: number;
  readonly z: number;
  readonly spec: MassingCitySpec;
}

export class CityStreamer {
  readonly #tier: TierId;
  readonly #terrainSampler: TerrainSampler;
  readonly nightGain: UniformNode<'float', number> = uniform(1);
  readonly #candidates: CandidateRegion[] = [];
  readonly #live = new Map<string, MassingCityWorld>();
  /** LRU order: last entry is the least recently active (unbuilt first on budget pressure). */
  readonly #lru: string[] = [];
  #disposed = false;

  constructor(
    plan: WorldPlan,
    tier: TierId,
    terrainSampler: TerrainSampler,
    options: {
      readonly attach: (city: MassingCityWorld) => void;
      readonly detach: (city: MassingCityWorld) => void;
    },
  ) {
    this.#tier = tier;
    this.#terrainSampler = terrainSampler;
    this.#attach = options.attach;
    this.#detach = options.detach;
    // Urban regions inside the road window (the home cell is the full kit city, not massing).
    for (let iz = -ROAD_WINDOW_CELLS; iz <= ROAD_WINDOW_CELLS; iz += 1) {
      for (let ix = -ROAD_WINDOW_CELLS; ix <= ROAD_WINDOW_CELLS; ix += 1) {
        if (ix === 0 && iz === 0) continue;
        const region = plan.regionAtCell(ix, iz);
        if (region.archetype !== 'megacity' && region.archetype !== 'urban-fringe') continue;
        this.#candidates.push({
          regionId: region.id,
          x: region.district.centerX,
          z: region.district.centerZ,
          spec: massingCityForRegion(region),
        });
      }
    }
  }

  #attach: (city: MassingCityWorld) => void;
  #detach: (city: MassingCityWorld) => void;

  /** Per-frame steering: build the nearest approachable city, release far ones. */
  update(focus: { readonly x: number; readonly z: number }): void {
    if (this.#disposed) return;
    // Release cities the player has left.
    for (const [regionId, city] of [...this.#live]) {
      const distance = Math.hypot(city.root.position.x - focus.x, city.root.position.z - focus.z);
      if (distance > UNBUILD_RADIUS_METERS) {
        this.#unbuild(regionId);
      }
    }
    const budget = MAX_LIVE_CITIES[this.#tier] ?? 2;
    if (this.#live.size >= budget) return;
    // Build at most one city per frame, nearest first.
    const next = this.#candidates.find(
      (candidate) =>
        !this.#live.has(candidate.regionId) &&
        Math.hypot(candidate.x - focus.x, candidate.z - focus.z) < BUILD_RADIUS_METERS,
    );
    if (next === undefined) return;
    const city = new MassingCityWorld(next.spec, this.#tier, {
      nightGain: this.nightGain,
      baseY: this.#terrainSampler.heightAt(next.x, next.z),
    });
    this.#attach(city);
    this.#live.set(next.regionId, city);
    this.#lru.push(next.regionId);
  }

  setDaylight(state: DaylightState): void {
    this.nightGain.value = resolveUrbanNightGain(state.sunElevationDegrees);
  }

  collideTown(car: TownCarProbe): readonly TownHit[] {
    const hits: TownHit[] = [];
    for (const city of this.#live.values()) {
      hits.push(...city.collideTown(car));
    }
    return hits;
  }

  getContentStats(): Readonly<Record<string, number>> {
    const stats: Record<string, number> = { massingCitiesLive: this.#live.size };
    for (const city of this.#live.values()) {
      const cityStats = city.getContentStats();
      stats.massingCityTowers = (stats.massingCityTowers ?? 0) + (cityStats.massingCityTowers ?? 0);
      stats.massingCityInfill = (stats.massingCityInfill ?? 0) + (cityStats.massingCityInfill ?? 0);
      stats.massingCityPointLights =
        (stats.massingCityPointLights ?? 0) + (cityStats.massingCityPointLights ?? 0);
    }
    return stats;
  }

  #unbuild(regionId: string): void {
    const city = this.#live.get(regionId);
    if (city === undefined) return;
    this.#live.delete(regionId);
    this.#lru.splice(this.#lru.indexOf(regionId), 1);
    this.#detach(city);
    city.dispose();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const regionId of [...this.#live.keys()]) {
      this.#unbuild(regionId);
    }
    this.nightGain.dispose?.();
  }
}
