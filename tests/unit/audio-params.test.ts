import { describe, expect, it } from 'vitest';

import {
  detectImpact,
  engineFreqFromRpm,
  engineGain,
  initialImpactState,
  IDLE_RPM,
  REDLINE_RPM,
  radioKindToStinger,
  skidGain,
  stingerNoteDurationMs,
  stingerNotes,
  UI_CLICK_HZ,
  windGain,
  type StingerKind,
} from '../../src/audio/params';
import type { VehicleTelemetry } from '../../src/vehicles/types';

function telemetry(overrides: Partial<VehicleTelemetry>): VehicleTelemetry {
  return {
    speedMps: 0,
    speedKph: 0,
    forwardSpeed: 0,
    rpm: IDLE_RPM,
    gear: 1,
    shifting: false,
    throttle: 0,
    brake: 0,
    handbrake: false,
    steerAngle: 0,
    contactCount: 4,
    averageSurfaceGripModifier: 1,
    averageSurfaceRollingResistance: 0.01,
    isGrounded: true,
    slipAngle: 0,
    lateralAcceleration: 0,
    longitudinalAcceleration: 0,
    drifting: false,
    distanceTravelled: 0,
    ...overrides,
  };
}

describe('Audio — pure signal mapping (Phase 13)', () => {
  it('engine pitch rises monotonically with rpm across the rev band', () => {
    expect(engineFreqFromRpm(IDLE_RPM)).toBeLessThan(engineFreqFromRpm(3000));
    expect(engineFreqFromRpm(3000)).toBeLessThan(engineFreqFromRpm(REDLINE_RPM));
    // Out‑of‑band rpm clamps to the band edges.
    expect(engineFreqFromRpm(0)).toBe(engineFreqFromRpm(IDLE_RPM));
    expect(engineFreqFromRpm(REDLINE_RPM + 5000)).toBe(engineFreqFromRpm(REDLINE_RPM));
  });

  it('engine gain grows with throttle and speed, with a soft idle base', () => {
    const idle = engineGain(telemetry({}));
    const loaded = engineGain(telemetry({ throttle: 1 }));
    const loadedFast = engineGain(telemetry({ throttle: 1, speedMps: 60 }));
    expect(idle).toBeGreaterThan(0.1);
    expect(loaded).toBeGreaterThan(idle);
    expect(loadedFast).toBeGreaterThan(loaded);
    expect(loadedFast).toBeLessThanOrEqual(1);
  });

  it('tyre squawk needs speed + slip (or handbrake), and is silent airborne', () => {
    expect(skidGain(telemetry({}))).toBe(0); // standing still
    expect(skidGain(telemetry({ speedMps: 20, slipAngle: 0.4 }))).toBeGreaterThan(0.4);
    expect(skidGain(telemetry({ speedMps: 20, handbrake: true }))).toBeGreaterThan(0.3);
    expect(
      skidGain(telemetry({ speedMps: 20, slipAngle: 0.4, isGrounded: false, contactCount: 0 })),
    ).toBe(0);
  });

  it('wind gain is quiet at town speed and grows with airspeed', () => {
    expect(windGain(telemetry({ speedMps: 5 }))).toBe(0);
    expect(windGain(telemetry({ speedMps: 30 }))).toBeGreaterThan(0.15);
    expect(windGain(telemetry({ speedMps: 55 }))).toBeGreaterThan(
      windGain(telemetry({ speedMps: 30 })),
    );
  });

  it('impact detection fires on a hard deceleration and a lateral hit, with a refractory', () => {
    const state = initialImpactState();
    // Steady state: no impact.
    expect(detectImpact(state, telemetry({ longitudinalAcceleration: -3 }), 0).intensity).toBe(0);
    // A wall hit (‑34 m/s^2): strong impact.
    const hit = detectImpact(state, telemetry({ longitudinalAcceleration: -34 }), 100);
    expect(hit.intensity).toBeGreaterThan(0.6);
    // Immediately after: refractory window suppresses repeats.
    expect(
      detectImpact(hit.state, telemetry({ longitudinalAcceleration: -34 }), 200).intensity,
    ).toBe(0);
    // After the refractory: it can fire again.
    expect(
      detectImpact(hit.state, telemetry({ longitudinalAcceleration: -30 }), 400).intensity,
    ).toBeGreaterThan(0);
    // A lateral scrape at speed also fires; standing still it does not.
    expect(
      detectImpact(initialImpactState(), telemetry({ lateralAcceleration: 16, speedMps: 15 }), 5000)
        .intensity,
    ).toBeGreaterThan(0);
    expect(
      detectImpact(initialImpactState(), telemetry({ lateralAcceleration: 16, speedMps: 2 }), 5000)
        .intensity,
    ).toBe(0);
  });

  it('stingers are well‑formed melodies and map from the right radio codes', () => {
    for (const kind of [
      'won',
      'lost',
      'busted',
      'evaded',
      'levelUp',
      'unitDown',
    ] as StingerKind[]) {
      const notes = stingerNotes(kind);
      expect(notes.length).toBeGreaterThanOrEqual(2);
      expect(notes.every((n) => n > 100 && n < 2000)).toBe(true);
      expect(stingerNoteDurationMs(kind)).toBeGreaterThan(0);
    }
    expect(stingerNotes('boost')).toEqual([]); // a whoosh, not a melody
    expect(radioKindToStinger('busted')).toBe('busted');
    expect(radioKindToStinger('evaded')).toBe('evaded');
    expect(radioKindToStinger('levelUp')).toBe('levelUp');
    expect(radioKindToStinger('unitDown')).toBe('unitDown');
    expect(radioKindToStinger('rhino')).toBeNull(); // routine chatter
    expect(UI_CLICK_HZ).toBeGreaterThan(0);
  });

  /**
   * **Human‑perspective audio playthrough:** a driver launches, holds the throttle through gear
   * changes, drifts a corner, slams the brakes into a wall, and pops nitro. This replays the
   * telemetry a real driver would produce and asserts the *audio a player would hear* at each
   * moment — revs climbing, squawk only while sliding, a single thud on the wall, wind growing.
   */
  it('human playthrough: the sound tracks what the driver does', () => {
    let impactState = initialImpactState();
    const frames: {
      t: number;
      freq: number;
      engine: number;
      skid: number;
      wind: number;
      impact: number;
    }[] = [];
    let t = 0;
    const dt = 0.1;
    for (let i = 0; i < 200; i++) {
      t += dt;
      let tl: VehicleTelemetry;
      if (i < 40) {
        // Launch: throttle down, rpm sweeping the rev band as gears bite.
        const rpm = IDLE_RPM + (REDLINE_RPM - IDLE_RPM) * (0.3 + 0.7 * ((i * 0.7) % 1));
        tl = telemetry({ throttle: 1, speedMps: (i / 40) * 28, rpm, gear: 1 + Math.floor(i / 14) });
      } else if (i < 90) {
        // Steady fast driving, then a handbrake drift through the corner.
        const drifting = i >= 60;
        tl = telemetry({
          speedMps: 28,
          rpm: 3200,
          gear: 3,
          throttle: drifting ? 0.6 : 0.8,
          slipAngle: drifting ? 0.38 : 0.02,
          handbrake: drifting,
          drifting,
        });
      } else if (i < 130) {
        // Slam the brakes; at i==120 the car hits the wall (hard deceleration spike).
        const hitting = i === 120;
        tl = telemetry({
          speedMps: hitting ? 12 : 28 - (i - 90) * 0.6,
          rpm: 1600,
          gear: 2,
          brake: 1,
          longitudinalAcceleration: hitting ? -36 : -9,
        });
      } else {
        // Nitro out of the corner: high speed, low slip.
        tl = telemetry({ speedMps: 52, rpm: 5200, gear: 4, throttle: 1 });
      }
      const impact = detectImpact(impactState, tl, t * 1000);
      impactState = impact.state;
      frames.push({
        t,
        freq: engineFreqFromRpm(tl.rpm),
        engine: engineGain(tl),
        skid: skidGain(tl),
        wind: windGain(tl),
        impact: impact.intensity,
      });
    }

    const launch = frames.filter((f) => f.t < 4); // launch (i<40)
    const cruise = frames.find((f) => f.t >= 4.1 && f.t < 5.9)!; // steady driving, pre‑drift
    const drift = frames.find((f) => f.t >= 6.5 && f.t < 8.9)!; // mid‑drift
    const wall = frames.find((f) => f.t >= 12.05 && f.t < 12.15)!; // the hit frame (i==120)
    const nitro = frames.find((f) => f.t >= 13.5)!; // after nitro

    // Revs climb while launching, and the engine is loud under load.
    expect(launch.at(-1)!.freq).toBeGreaterThan(launch[0]!.freq);
    expect(launch[0]!.engine).toBeGreaterThan(0.4);
    // Steady cruise: engine present, no squawk (low slip), some wind.
    expect(cruise.engine).toBeGreaterThan(0.3);
    expect(cruise.skid).toBeLessThan(0.1);
    expect(cruise.wind).toBeGreaterThan(0.1);
    // The drift: squawk is the loudest thing besides the engine.
    expect(drift.skid).toBeGreaterThan(0.4);
    // The wall: exactly one frame of strong impact.
    expect(wall.impact).toBeGreaterThan(0.6);
    const impactFrames = frames.filter((f) => f.impact > 0);
    expect(impactFrames).toHaveLength(1); // refractory + clean telemetry = one thud
    expect(impactFrames[0]!.t).toBeCloseTo(12.1, 1);
    // Nitro: fast → strong wind, engine high, no squawk.
    expect(nitro.wind).toBeGreaterThan(cruise.wind);
    expect(nitro.engine).toBeGreaterThan(cruise.engine);
    expect(nitro.skid).toBeLessThan(0.1);
  });
});
