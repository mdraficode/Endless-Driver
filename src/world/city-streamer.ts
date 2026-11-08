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
import { computeRegionPedestrians, type RegionPedestrianData } from './pedestrians';
import { MassingCityWorld } from './urban-massing';
import { computeRegionClutter } from './urban-clutter';
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
  readonly seed: number;
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

  /** Phase 10.3: the pedestrian system streams its region data in and out with the cities. */
  readonly #pedestrians: {
    setRegion(data: RegionPedestrianData): void;
    clearRegion(regionId: string): void;
  };

  constructor(
    plan: WorldPlan,
    tier: TierId,
    terrainSampler: TerrainSampler,
    options: {
      readonly attach: (city: MassingCityWorld) => void;
      readonly detach: (city: MassingCityWorld) => void;
      readonly pedestrians?: {
        setRegion(data: RegionPedestrianData): void;
        clearRegion(regionId: string): void;
      };
    },
  ) {
    this.#pedestrians = options.pedestrians ?? {
      setRegion: () => undefined,
      clearRegion: () => undefined,
    };
    this.#tier = tier;
    this.#terrainSampler = terrainSampler;
    this.#attach = options.attach;
    this.#detach = options.detach;
    // Phase 10 pass 3: the specs clear their placements against the solved network, so
    // no building ever straddles a drivable road.
    const network = this.#terrainSampler.roadNetwork;
    // Phase 10 pass 4: buildings also clear the garage pits (the ground there is sunken).
    const pits = network?.garages.map((garage) => garage.pit) ?? [];
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
          seed: region.seed,
          spec:
            network === undefined
              ? massingCityForRegion(region)
              : massingCityForRegion(region, { network, pits }),
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
    // Phase 10.4 (C4): the street clutter of this block is resolved with it.
    const network = this.#terrainSampler.roadNetwork;
    const clutter =
      network !== undefined
        ? computeRegionClutter(next.spec, network, this.#tier, next.seed)
        : undefined;
    const city = new MassingCityWorld(next.spec, this.#tier, {
      nightGain: this.nightGain,
      baseY: this.#terrainSampler.heightAt(next.x, next.z),
      // Phase 10 pass 3: the carved surface — buildings stand on the local ground.
      heightAt: (x, z) => this.#terrainSampler.heightAt(x, z),
      ...(clutter === undefined ? {} : { clutter }),
    });
    this.#attach(city);
    this.#live.set(next.regionId, city);
    this.#lru.push(next.regionId);
    // The pedestrians of this block rise with it: sidewalks from the solved roads,
    // activity nodes from the region seed.
    if (this.#pedestrians !== undefined && network !== undefined) {
      this.#pedestrians.setRegion(computeRegionPedestrians(next.spec, network, next.seed));
    }
  }

  setDaylight(state: DaylightState): void {
    this.nightGain.value = resolveUrbanNightGain(state.sunElevationDegrees);
  }

  /**
   * Live weather wetness (Phase 10.5 pass C): the streamed cities' street-lamp pools
   * fade in as the roads wet up. The night gain is shared, so the pools read as
   * night-only; forward it whenever the weather sample changes.
   */
  setSurfaceWetness(wetness: number): void {
    for (const city of this.#live.values()) {
      city.setSurfaceWetness(wetness);
    }
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
    this.#pedestrians?.clearRegion(regionId);
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
