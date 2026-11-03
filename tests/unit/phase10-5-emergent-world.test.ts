import { describe, expect, it } from 'vitest';

import { STREAMED_TRAFFIC_BUDGET, WORLD_EVENTS_CONFIG } from '../../src/config/world-events';
import { buildRoadLayout } from '../../src/world/road-layout';
import { buildRoadNetwork } from '../../src/world/road-network';
import { createWorldPlan } from '../../src/world/world-plan';
import { deriveRegionRoutes } from '../../src/world/traffic-routes';
import { GpuTrafficWorld } from '../../src/world/gpu-traffic';
import { computeRegionEvents, WorldEventManager } from '../../src/world/world-events';
import { NitroBoost } from '../../src/vehicles/NitroBoost';

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
      if (candidate.archetype === 'megacity' || candidate.archetype === 'urban-fringe') {
        region = candidate;
      }
    }
  }
  if (region === null) throw new Error('no urban region found in the test world');
  return { plan, network, region };
};

describe('Phase 10.5 (C5) — traffic routes', () => {
  it('derives closed, on-road loops deterministically, within the per-archetype cap', () => {
    const { plan, network, region } = buildWorld();
    const a = deriveRegionRoutes(network, region);
    const b = deriveRegionRoutes(network, region);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const cap = region.archetype === 'megacity' ? 12 : 8;
    expect(a.routes.length).toBeGreaterThan(0);
    expect(a.routes.length).toBeLessThanOrEqual(cap);
    for (const route of a.routes) {
      expect(route.points.length).toBe(128);
      // Closed loop: the last sample sits one spacing step from the first.
      const gap = Math.hypot(
        route.points[0]!.x - route.points[127]!.x,
        route.points[0]!.z - route.points[127]!.z,
      );
      expect(gap).toBeGreaterThan(route.spacing * 0.6);
      expect(gap).toBeLessThan(route.spacing * 1.6);
      // On-road: the centreline samples sit on the solved pavement.
      let onRoad = 0;
      for (let i = 0; i < route.points.length; i += 8) {
        const p = route.points[i]!;
        const s = network.sample(p.x, p.z);
        if (s !== null && s.distance <= s.halfWidthMeters + 0.6) onRoad += 1;
      }
      expect(onRoad / Math.ceil(route.points.length / 8)).toBeGreaterThan(0.8);
      expect(route.halfWidthMeters).toBeGreaterThanOrEqual(2.6);
    }
    // A different region derives its own (different) loops.
    const other = plan.regionAtCell(region.ix + 1, region.iz);
    if (other.archetype === 'megacity' || other.archetype === 'urban-fringe') {
      expect(JSON.stringify(deriveRegionRoutes(network, other))).not.toBe(
        JSON.stringify(deriveRegionRoutes(network, region)),
      );
    }
  });
});

describe('Phase 10.5 (C5) — GPU traffic (hidden CPU fallback)', () => {
  it('fills the tier budget, stays on the roads, and reports player collisions', () => {
    const { plan, network, region } = buildWorld();
    const traffic = new GpuTrafficWorld(network, plan, 'C');
    traffic.configureBackend('webgl2', null as never);
    const focus = { x: region.district.centerX, z: region.district.centerZ };
    const dt = 1 / 60;
    for (let f = 0; f < 600; f += 1) {
      traffic.update(dt, focus, { x: 0, z: 0 });
    }
    const stats = traffic.getContentStats();
    expect(stats.streamedTrafficGpu).toBe(0);
    expect(stats.streamedTrafficVehicles).toBe(STREAMED_TRAFFIC_BUDGET.C);
    expect(stats.streamedTrafficRoutes).toBeGreaterThan(0);
    // Every live instance sits on the pavement with finite coordinates.
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

    // Head-on run: pick a live vehicle, stand 2 m ahead of its travel and drive at it.
    const car = traffic.root.children.find((c) => c.name === 'streamed-traffic-passenger-car');
    const e = (car as unknown as { instanceMatrix: { array: Float32Array } }).instanceMatrix.array;
    let idx = -1;
    for (let i = 0; i < (car as unknown as { count: number }).count && idx === -1; i += 1) {
      if (
        e[i * 16 + 13]! > -10 &&
        e[i * 16 + 12]! > region.district.centerX &&
        e[i * 16 + 12]! < region.district.centerX + 200
      ) {
        idx = i;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    // Read the velocity from one frame of motion, then converge on the vehicle.
    const prevX = e[idx * 16 + 12]!;
    const prevZ = e[idx * 16 + 14]!;
    traffic.update(dt, focus, { x: 0, z: 0 });
    const vx = (e[idx * 16 + 12]! - prevX) / dt;
    const vz = (e[idx * 16 + 14]! - prevZ) / dt;
    const speed = Math.hypot(vx, vz) || 1;
    let hits = 0;
    for (let f = 0; f < 240; f += 1) {
      const cx = e[idx * 16 + 12]!;
      const cz = e[idx * 16 + 14]!;
      const ux = vx / speed;
      const uz = vz / speed;
      focus.x = cx + ux * 2;
      focus.z = cz + uz * 2;
      traffic.update(dt, focus, { x: -ux * 20, z: -uz * 20 });
      hits += traffic.consumeImpulses().length;
      if (e[idx * 16 + 13]! < -10) break; // the hit vehicle parked out
    }
    expect(hits).toBeGreaterThan(0);
    traffic.dispose();
  });
});

describe('Phase 10.5 (C5) — world events', () => {
  it('places events deterministically and resolves trap passes by average speed', () => {
    const { plan, network, region } = buildWorld();
    const a = computeRegionEvents(region, network);
    const b = computeRegionEvents(region, network);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.speedTraps.length).toBeLessThanOrEqual(2);
    expect(a.driftZones.length).toBeLessThanOrEqual(2);
    expect(a.bonusBoards.length).toBeGreaterThanOrEqual(1);
    expect(a.bonusBoards.length).toBeLessThanOrEqual(2);
    if (a.speedTraps.length === 0) return;
    const trap = a.speedTraps[0]!;
    const fx = -Math.sin(trap.yaw);
    const fz = -Math.cos(trap.yaw);
    const drive = (speed: number) => {
      const manager = new WorldEventManager(network, plan, null);
      const focus = { x: trap.x - fx * 30, z: trap.z - fz * 30 };
      const dt = 1 / 60;
      const messages: { text: string; tone: 'info' | 'error' }[] = [];
      let boost = 0;
      for (let f = 0; f < 60 * 10; f += 1) {
        focus.x += fx * speed * dt;
        focus.z += fz * speed * dt;
        manager.update(dt, focus, {
          x: focus.x,
          y: 0,
          z: focus.z,
          speedMps: speed,
          forwardSpeed: speed,
          yaw: trap.yaw,
          drifting: false,
        });
        messages.push(...manager.consumeMessages());
        boost += manager.consumeBoostDelta();
      }
      manager.dispose();
      return { messages, boost };
    };
    const busted = drive(15);
    expect(busted.messages.some((m) => m.text.includes('busted'))).toBe(true);
    const clean = drive(9);
    expect(clean.messages.some((m) => m.text.includes('Clean'))).toBe(true);
    expect(clean.boost).toBeCloseTo(WORLD_EVENTS_CONFIG.speedTrap.cleanBoostBonus, 5);
  });

  it('softens grip and charges nitro inside drift zones', () => {
    const { plan, network } = buildWorld();
    let region = null;
    let set = null;
    for (let iz = -2; iz <= 2 && region === null; iz += 1) {
      for (let ix = -2; ix <= 2 && region === null; ix += 1) {
        if (ix === 0 && iz === 0) continue;
        const candidate = plan.regionAtCell(ix, iz);
        if (candidate.archetype !== 'megacity' && candidate.archetype !== 'urban-fringe') continue;
        const events = computeRegionEvents(candidate, network);
        if (events.driftZones.length > 0) {
          region = candidate;
          set = events;
        }
      }
    }
    expect(region).not.toBeNull();
    const zone = set!.driftZones[0]!;
    const manager = new WorldEventManager(network, plan, null);
    const fx = -Math.sin(zone.yaw);
    const fz = -Math.cos(zone.yaw);
    const focus = { x: zone.x - fx * 40, z: zone.z - fz * 40 };
    const dt = 1 / 60;
    for (let f = 0; f < 60 * 6; f += 1) {
      focus.x += fx * 10 * dt;
      focus.z += fz * 10 * dt;
      manager.update(dt, focus, {
        x: focus.x,
        y: 0,
        z: focus.z,
        speedMps: 10,
        forwardSpeed: 10,
        yaw: zone.yaw,
        drifting: true,
      });
      manager.consumeMessages();
    }
    // The zone spans 40 m at 10 m/s: about four seconds of 5%/s charging.
    expect(manager.consumeBoostDelta()).toBeGreaterThan(0.15);
    manager.dispose();
    // The grip modifier is only active on the zone's pavement.
    const manager2 = new WorldEventManager(network, plan, null);
    manager2.update(
      0,
      { x: zone.x, z: zone.z },
      {
        x: zone.x,
        y: 0,
        z: zone.z,
        speedMps: 0,
        forwardSpeed: 0,
        yaw: zone.yaw,
        drifting: false,
      },
    );
    expect(manager2.zoneGripModifier(zone.x, zone.z)).toBe(
      WORLD_EVENTS_CONFIG.driftZone.gripModifier,
    );
    expect(manager2.zoneGripModifier(zone.x + 200, zone.z)).toBe(1);
    manager2.dispose();
  });

  it('smashes boards on fast contact and launches the off-road jump once per cooldown', () => {
    const { plan, network, region } = buildWorld();
    const set = computeRegionEvents(region, network);
    const board = set.bonusBoards[0]!;
    // Terrain: flat, with a 1 m step 3 m ahead on +x.
    const stepHeight = (x: number, z: number): number =>
      x >= board.x + 3 && z === board.z ? 1.0 : 0.0;
    const manager = new WorldEventManager(network, plan, stepHeight);
    const dt = 1 / 60;
    // Approach the board at 12 m/s from 10 m away, driving toward +x (yaw = pi).
    const focus = { x: board.x - 10, z: board.z };
    const fx = 1;
    const fz = 0;
    const eastYaw = Math.atan2(-fx, -fz);
    let smashed = false;
    for (let f = 0; f < 300; f += 1) {
      focus.x += fx * 12 * dt;
      manager.update(dt, focus, {
        x: focus.x,
        y: 0,
        z: focus.z,
        speedMps: 12,
        forwardSpeed: 12,
        yaw: eastYaw,
        drifting: false,
      });
      const messages = manager.consumeMessages();
      if (messages.some((m) => m.text.includes('smashed'))) smashed = true;
      manager.consumeImpulse();
    }
    expect(smashed).toBe(true);
    expect(manager.getContentStats().worldEventBoardsSmashed).toBe(1);
    // Jump: at 14 m/s over the step, one launch (impulse + cooldown), then quiet for 18 s.
    const jumpManager = new WorldEventManager(network, plan, stepHeight);
    let launches = 0;
    let impulseY = 0;
    let jx = board.x - 8;
    for (let f = 0; f < 60 * 40; f += 1) {
      jx += 14 * dt;
      jumpManager.update(
        dt,
        { x: jx, z: board.z },
        {
          x: jx,
          y: 0,
          z: board.z,
          speedMps: 14,
          forwardSpeed: 14,
          yaw: Math.atan2(-1, 0),
          drifting: false,
        },
      );
      jumpManager.consumeMessages();
      const impulse = jumpManager.consumeImpulse();
      if (impulse !== null) {
        launches += 1;
        impulseY = impulse.y;
      }
    }
    expect(launches).toBe(1);
    expect(impulseY).toBeCloseTo(WORLD_EVENTS_CONFIG.offroadJump.impulsePerMetersPerSecond * 14, 1);
    manager.dispose();
    jumpManager.dispose();
  });
});

describe('Phase 10.5 (C5) — nitro boost deltas', () => {
  it('adjustCharge clamps the tank to [0, 1]', () => {
    const boost = new NitroBoost();
    // A full tank stays full when the world grants more.
    expect(boost.adjustCharge(0.5).charge).toBe(1);
    const empty = new NitroBoost();
    // Drain the tank, then push it negative.
    for (let f = 0; f < 60 * 10; f += 1) empty.update(1 / 60, true);
    expect(empty.state.charge).toBe(0);
    expect(empty.adjustCharge(-0.5).charge).toBe(0);
  });
});
