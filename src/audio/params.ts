/**
 * Phase 13 — procedural audio, the **pure** signal-mapping layer.
 *
 * The game is silent-clean (no recorded audio, no licences to chase): every sound is synthesized
 * with Web Audio. This module is the testable brain — it maps live vehicle telemetry to audio
 * parameters (engine pitch/gain, tyre-squawk gain, wind gain), detects impacts, and defines the
 * little radio/stinger melodies. It has no `AudioContext`, so it runs and is tested in Node;
 * `AudioEngine` is the thin Web Audio shell that plays what this decides.
 */
import type { VehicleTelemetry } from '../vehicles/types';
import { clamp } from '../shared/math';
import type { RadioKind } from '../most-wanted/HeatModel';

/** The drivetrain's operating window (mirrors `VEHICLE_CONFIG.drivetrain`). */
export const IDLE_RPM = 900;
export const REDLINE_RPM = 7200;

/** The synthesized engine's fundamental frequency range (Hz) across the rev band. */
export const ENGINE_FREQ_MIN_HZ = 48;
export const ENGINE_FREQ_MAX_HZ = 238;

/**
 * Engine fundamental frequency for a given rpm. Monotonic: idle sits low, redline sits high, so
 * a player "hears" the revs and gear changes without looking at the gauge.
 */
export function engineFreqFromRpm(rpm: number): number {
  const t = clamp((rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM), 0, 1);
  return ENGINE_FREQ_MIN_HZ + t * (ENGINE_FREQ_MAX_HZ - ENGINE_FREQ_MIN_HZ);
}

/** Engine loudness (0..1): louder under throttle load and at speed; a soft base at idle. */
export function engineGain(telemetry: VehicleTelemetry): number {
  const speedT = clamp(telemetry.speedMps / 55, 0, 1);
  return clamp(0.14 + 0.46 * telemetry.throttle + 0.28 * speedT, 0, 1);
}

/**
 * Tyre-squawk gain (0..1). Requires some speed to squeal and reads off the chassis slip angle;
 * the handbrake (deliberate drift) counts as sustained slip. Airborne = no tyre noise.
 */
export function skidGain(telemetry: VehicleTelemetry): number {
  if (!telemetry.isGrounded) return 0;
  const speedT = clamp((telemetry.speedMps - 4) / 12, 0, 1);
  const slipT = clamp(Math.abs(telemetry.slipAngle) / 0.5, 0, 1);
  const demand = Math.max(slipT, telemetry.handbrake ? 0.7 : 0);
  return demand * (0.25 + 0.75 * speedT);
}

/** Wind/road rush gain (0..1): quiet at town speed, growing with airspeed. */
export function windGain(telemetry: VehicleTelemetry): number {
  const v = Math.max(0, telemetry.speedMps - 10);
  return 0.8 * clamp(v / 45, 0, 1) ** 1.5;
}

/** Refractory between impact sounds so a sustained scrape doesn't machine-gun the thud. */
export const IMPACT_REFRACTORY_MS = 250;

/** State carried across frames for impact detection (the last time we thudded). */
export interface ImpactState {
  readonly lastImpactAtMs: number;
}

export function initialImpactState(): ImpactState {
  return { lastImpactAtMs: Number.NEGATIVE_INFINITY };
}

/**
 * A crash or a hard scrape: a sharp longitudinal deceleration (wall, bumper, emergency stop) or a
 * large lateral hit at speed. Returns the intensity (0..1) and the updated state; `0` during the
 * refractory window.
 */
export function detectImpact(
  state: ImpactState,
  telemetry: VehicleTelemetry,
  nowMs: number,
): { readonly state: ImpactState; readonly intensity: number } {
  if (nowMs - state.lastImpactAtMs < IMPACT_REFRACTORY_MS) {
    return { state, intensity: 0 };
  }
  const longThud =
    telemetry.longitudinalAcceleration < -16
      ? clamp((-telemetry.longitudinalAcceleration - 16) / 24, 0, 1)
      : 0;
  const lateralScrape =
    Math.abs(telemetry.lateralAcceleration) > 13 && telemetry.speedMps > 8
      ? 0.8 * clamp((Math.abs(telemetry.lateralAcceleration) - 13) / 15, 0, 1)
      : 0;
  const intensity = Math.max(longThud, lateralScrape);
  if (intensity <= 0) {
    return { state, intensity: 0 };
  }
  return { state: { lastImpactAtMs: nowMs }, intensity };
}

/** The one-shot stingers the player hears on big moments. */
export type StingerKind =
  'busted' | 'evaded' | 'won' | 'lost' | 'levelUp' | 'unitDown' | 'boost' | 'champion';

/** Note frequencies (Hz) for a stinger; `boost` is a noise whoosh, not a melody. */
export function stingerNotes(kind: StingerKind): readonly number[] {
  switch (kind) {
    case 'won':
      return [392, 494, 587, 784]; // rising major — Pink Slip in hand
    case 'champion':
      return [523, 659, 784, 1047]; // bright ascending major — the whole Blacklist is yours
    case 'lost':
      return [330, 262, 208]; // falling minor — DNF
    case 'busted':
      return [294, 233, 196]; // harsh, lower fall — cuffed
    case 'evaded':
      return [523, 784]; // bright two-note lift — pursuit stood down
    case 'levelUp':
      return [659, 880]; // quick blip up — the heat climbed
    case 'unitDown':
      return [196, 156]; // low thud — 10-25
    case 'boost':
      return [];
  }
}

/** How long each stinger note rings (ms). */
export function stingerNoteDurationMs(kind: StingerKind): number {
  switch (kind) {
    case 'won':
    case 'lost':
    case 'busted':
      return 130;
    case 'evaded':
      return 110;
    case 'levelUp':
      return 90;
    case 'unitDown':
      return 150;
    case 'boost':
      return 0;
    case 'champion':
      return 170;
  }
}

/** Which radio codes are worth a stinger (the rest are routine chatter). */
export function radioKindToStinger(kind: RadioKind): StingerKind | null {
  switch (kind) {
    case 'busted':
      return 'busted';
    case 'evaded':
      return 'evaded';
    case 'levelUp':
      return 'levelUp';
    case 'unitDown':
      return 'unitDown';
    default:
      return null;
  }
}

/** UI blips. */
export const UI_CLICK_HZ = 1250;
export const UI_OPEN_NOTES: readonly number[] = [880, 1175];
