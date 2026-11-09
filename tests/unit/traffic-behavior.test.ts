import { describe, expect, it } from 'vitest';

import { TRAFFIC_LANE_INSET_METERS } from '../../src/config/world-events';
import { buildRoadLayout } from '../../src/world/road-layout';
import { buildRoadNetwork } from '../../src/world/road-network';
import { createWorldPlan } from '../../src/world/world-plan';
import { deriveRegionRoutes } from '../../src/world/traffic-routes';
import {
  GpuTrafficWorld,
  evaluateOvertake,
  playerLeadTargetMetersPerSecond,
  stepLaneLateral,
} from '../../src/world/gpu-traffic';

/**
 * Phase 10.5 pass B — AI traffic driving behavior: overtaking (lane changes) and
 * player-aware car following. The CPU shadow is the testable mirror of the two-kernel
 * WebGPU compute pass; the pure helpers below are the expressions the kernel repeats.
 */

const TEST_HEIGHT = (x: number, z: number): number =>
  Math.sin(x * 0.001) * 4 + Math.cos(z * 0.001) * 3;

const buildWorld = () => {
  const plan = createWorldPlan(20261104);
  const network = buildRoadNetwork(buildRoadLayout(plan).config, TEST_HEIGHT);
  let region = null;
  for (let iz = -1; iz <= 1 && region === null; iz += 1) {
    for (let ix = -1; ix <= 1 && region === null; ix += 1) {
      if (ix === 0 && iz === 0) continue;
      const candidate = plan.regionAtCell(ix, iz);
      if (candidate.archetype !== 'megacity' && candidate.archetype !== 'urban-fringe') {
        continue;
      }
      if (deriveRegionRoutes(network, candidate).routes.length === 0) continue;
      region = candidate;
    }
  }
  if (region === null) throw new Error('no urban region with routes found in the test world');
  return { plan, network, region };
};

describe('overtake decision (shared with the kernel)', () => {
  const clear = {
    otherLaneLeaderGapMeters: 100,
    otherLaneFollowerGapMeters: 100,
    speedMetersPerSecond: 9,
    laneCooldownSeconds: 0,
  };
  it('moves out only when the own lane is blocked and the other is clear', () => {
    expect(evaluateOvertake({ ...clear, ownLeaderGapMeters: 10 })).toBe(true);
    // The own lane is open: hold the lane.
    expect(evaluateOvertake({ ...clear, ownLeaderGapMeters: 40 })).toBe(false);
    // A leader sits in the other lane: do not cut it off.
    expect(
      evaluateOvertake({ ...clear, ownLeaderGapMeters: 10, otherLaneLeaderGapMeters: 12 }),
    ).toBe(false);
    // A close follower in the other lane: wait for it to pass.
    expect(
      evaluateOvertake({ ...clear, ownLeaderGapMeters: 10, otherLaneFollowerGapMeters: 8 }),
    ).toBe(false);
  });

  it('respects the speed gate and the cooldown', () => {
    // Standing in a queue does not trigger a weave.
    expect(evaluateOvertake({ ...clear, ownLeaderGapMeters: 5, speedMetersPerSecond: 1 })).toBe(
      false,
    );
    expect(evaluateOvertake({ ...clear, ownLeaderGapMeters: 5, laneCooldownSeconds: 0.1 })).toBe(
      false,
    );
    // An overlap (negative gap) counts as blocked.
    expect(evaluateOvertake({ ...clear, ownLeaderGapMeters: -1 })).toBe(true);
  });
});

describe('player-lead target (shared with the kernel)', () => {
  it('matches the player at the bumper gap and recovers to cruise across the band', () => {
    // Bumper gap (2.5 m): the target is the player's own speed.
    expect(playerLeadTargetMetersPerSecond(2.5, 4, 10)).toBeCloseTo(4, 5);
    // Alongside / overlapping: no negative speed.
    expect(playerLeadTargetMetersPerSecond(-5, 4, 10)).toBeCloseTo(4, 5);
    // Full band (28 m): player speed + the recovery rate, capped at cruise.
    const atBand = playerLeadTargetMetersPerSecond(28, 10, 10);
    expect(atBand).toBeCloseTo(10, 5);
    const capped = playerLeadTargetMetersPerSecond(28, 12, 10);
    expect(capped).toBeCloseTo(10, 5);
    // A stopped player: crawl up to the recovery rate, never past cruise.
    expect(playerLeadTargetMetersPerSecond(15, 0, 10)).toBeGreaterThan(0);
    expect(playerLeadTargetMetersPerSecond(15, 0, 10)).toBeLessThan(10);
  });
});

describe('lane-lateral easing (shared with the kernel)', () => {
  it('approaches the target at the configured rate and settles exactly', () => {
    const dt = 1 / 60;
    let lateral = TRAFFIC_LANE_INSET_METERS;
    const target = -TRAFFIC_LANE_INSET_METERS;
    for (let f = 0; f < 400; f += 1) lateral = stepLaneLateral(lateral, target, dt);
    expect(lateral).toBeCloseTo(target, 5);
    // One step never overshoots.
    expect(stepLaneLateral(1.15, -1.15, 0.1)).toBeGreaterThan(-1.15);
    // Already settled: stays put.
    expect(stepLaneLateral(0, 0, dt)).toBe(0);
  });
});

describe('AI traffic behavior in the world (CPU shadow of the compute pass)', () => {
  it('the fleet overtakes behind slow leaders and stays on the pavement', () => {
    const { plan, network, region } = buildWorld();
    const traffic = new GpuTrafficWorld(network, plan, 'C');
    traffic.configureBackend('webgl2', null as never);
    const focus = { x: region.district.centerX, z: region.district.centerZ };
    const dt = 1 / 60;
    // ~3 minutes of driving: enough for the tier-C fleet (mix of cars and slow buses)
    // to build queues and clear overtakes.
    for (let f = 0; f < 60 * 180; f += 1) {
      traffic.update(dt, focus, { x: 0, z: 0 });
    }
    const stats = traffic.getContentStats();
    expect(stats.streamedTrafficVehicles).toBeGreaterThan(0);
    expect(stats.streamedTrafficLaneChanges).toBeGreaterThan(0);
    // Live instances remain finite and on the pavement (lane offsets stay in-lane).
    let checked = 0;
    for (const child of traffic.root.children) {
      if (child.name.endsWith('-lights')) continue;
      const mesh = child as unknown as {
        instanceMatrix: { array: Float32Array };
        count: number;
      };
      const e = mesh.instanceMatrix.array;
      for (let i = 0; i < mesh.count; i += 1) {
        const x = e[i * 16 + 12]!;
        const y = e[i * 16 + 13]!;
        const z = e[i * 16 + 14]!;
        expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
        if (y < -10) continue;
        checked += 1;
        const s = network.sample(x, z);
        expect(s).not.toBeNull();
        if (s !== null) expect(s.distance).toBeLessThanOrEqual(s.halfWidthMeters + 1.5);
      }
    }
    expect(checked).toBeGreaterThan(0);

    // The behavior is deterministic: a second identical run makes the same choices.
    const again = new GpuTrafficWorld(network, plan, 'C');
    again.configureBackend('webgl2', null as never);
    for (let f = 0; f < 60 * 180; f += 1) {
      again.update(dt, focus, { x: 0, z: 0 });
    }
    expect(again.getContentStats().streamedTrafficLaneChanges).toBe(
      stats.streamedTrafficLaneChanges,
    );
    traffic.dispose();
    again.dispose();
  });

  it('a vehicle follows a slow player on its route, then recovers when the player clears', () => {
    const { plan, network, region } = buildWorld();
    const traffic = new GpuTrafficWorld(network, plan, 'C');
    traffic.configureBackend('webgl2', null as never);
    const routes = deriveRegionRoutes(network, region).routes;
    const dt = 1 / 120;
    // Settle the fleet first (fixed focus, no player influence near a moving point).
    const centre = { x: region.district.centerX, z: region.district.centerZ };
    for (let f = 0; f < 60 * 20; f += 1) traffic.update(dt, centre, { x: 0, z: 0 });

    // Find a cruising passenger car (fast and live) and locate it on its route.
    const car = traffic.root.children.find((c) => c.name === 'streamed-traffic-passenger-car');
    const mesh = car as unknown as { instanceMatrix: { array: Float32Array }; count: number };
    const e = mesh.instanceMatrix.array;
    let idx = -1;
    for (let i = 0; i < mesh.count; i += 1) {
      if (e[i * 16 + 13]! > -10) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    const focus = { ...centre };
    const readPos = () => ({ x: e[idx * 16 + 12]!, z: e[idx * 16 + 14]! });
    const measureSpeed = (seconds: number) => {
      const a = readPos();
      for (let f = 0; f < Math.round(seconds / dt); f += 1)
        traffic.update(dt, focus, { x: 0, z: 0 });
      const b = readPos();
      return {
        speed: Math.hypot(b.x - a.x, b.z - a.z) / seconds,
        dir: { x: b.x - a.x, z: b.z - a.z },
      };
    };
    // Pick one that is actually cruising (not in a queue).
    let cruising = false;
    let lastDir = { x: 1, z: 0 };
    for (let attempt = 0; attempt < 3 && !cruising; attempt += 1) {
      focus.x = centre.x;
      focus.z = centre.z;
      const m = measureSpeed(0.5);
      if (m.speed > 7) {
        cruising = true;
        lastDir = m.dir;
      }
    }
    expect(cruising).toBe(true);

    // Locate the car on the derived routes. Bidirectional streets derive one
    // route PER DIRECTION along the same centerline, so plain nearest-sample can
    // land on the opposing lane (the sample phase differs between directions).
    // Disambiguate with the car's travel direction: prefer samples whose route
    // heading agrees with it, falling back to plain-nearest when the car is
    // (nearly) stopped.
    const locateCar = (dir: { x: number; z: number }) => {
      const here = readPos();
      const len = Math.hypot(dir.x, dir.z);
      const moving = len > 1e-3;
      const ux = moving ? dir.x / len : 0;
      const uz = moving ? dir.z / len : 0;
      type Cand = { d2: number; route: number; sample: number; dot: number };
      const cands: Cand[] = [];
      for (let r = 0; r < routes.length; r += 1) {
        const rt = routes[r]!;
        let routeD2 = Number.POSITIVE_INFINITY;
        let routeS = 0;
        for (let s = 0; s < rt.points.length; s += 1) {
          const p = rt.points[s]!;
          const d2 = (p.x - here.x) ** 2 + (p.z - here.z) ** 2;
          if (d2 < routeD2) {
            routeD2 = d2;
            routeS = s;
          }
        }
        const n = rt.points.length;
        const a = rt.points[(routeS + n - 1) % n]!;
        const b = rt.points[(routeS + 1) % n]!;
        const dl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const dot = ((b.x - a.x) / dl) * ux + ((b.z - a.z) / dl) * uz;
        cands.push({ d2: routeD2, route: r, sample: routeS, dot });
      }
      const aligned = moving ? cands.filter((c) => c.dot >= 0.5) : cands;
      const pool = aligned.length > 0 ? aligned : cands;
      pool.sort((x, y) => x.d2 - y.d2);
      const best = pool[0]!;
      return { bestD2: best.d2, route: routes[best.route]!, sample: best.sample };
    };
    const placePlayerAhead = (aheadMeters: number) => {
      const { route, sample } = locateCar(lastDir);
      const i = (sample + Math.round(aheadMeters / route.spacing)) % route.points.length;
      const p = route.points[i]!;
      focus.x = p.x;
      focus.z = p.z;
    };
    expect(locateCar(lastDir).bestD2).toBeLessThan(4 ** 2);
    // The player sits (static) on the route ahead of the car; measureSpeed advances
    // the sim with the focus held at the player position and zero player velocity.
    placePlayerAhead(16);
    // Phase 1: a stopped player 16 m ahead — the car must brake to a clean stop
    // behind it (no collision, no oscillation).
    const slow = measureSpeed(6);
    if (slow.speed > 0.5) lastDir = slow.dir;
    expect(slow.speed).toBeLessThan(4);
    // Phase 2: the player clears (far ahead, beyond the influence window) — the car
    // recovers toward cruise.
    placePlayerAhead(200);
    const fast = measureSpeed(6);
    if (fast.speed > 0.5) lastDir = fast.dir;
    expect(fast.speed).toBeGreaterThan(7);
    expect(fast.speed).toBeGreaterThan(slow.speed * 2);
    // Phase 3: the player stops the car again, closer in (re-located: the car has
    // moved since the first placement).
    placePlayerAhead(12);
    const hold = measureSpeed(6);
    expect(hold.speed).toBeLessThan(5);
    traffic.dispose();
  });
});
