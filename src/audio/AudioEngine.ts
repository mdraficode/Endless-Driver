import type { VehicleTelemetry } from '../vehicles/types';
import { clamp } from '../shared/math';
import {
  engineFreqFromRpm,
  engineGain,
  skidGain,
  windGain,
  detectImpact,
  initialImpactState,
  IDLE_RPM,
  type ImpactState,
  type StingerKind,
  stingerNotes,
  stingerNoteDurationMs,
  UI_CLICK_HZ,
  UI_OPEN_NOTES,
} from './params';

/**
 * Phase 13 — the thin Web Audio shell. Builds a small always‑on graph (engine + tyre + wind beds)
 * and one‑shot effects, and plays exactly what the pure `params` layer decides. It is
 * **headless‑safe**: with no `AudioContext` (Node tests, SSR) every method is a no‑op, and the
 * context is only created inside `unlock()` — which must be called from a user gesture, per the
 * browser autoplay policy.
 */
type AudioContextCtor = new () => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return Ctor ?? null;
}

export class AudioEngine {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  #engineOsc1: OscillatorNode | null = null;
  #engineOsc2: OscillatorNode | null = null;
  #engineGain: GainNode | null = null;
  #skidGain: GainNode | null = null;
  #skidFilter: BiquadFilterNode | null = null;
  #windGain: GainNode | null = null;
  #impactState: ImpactState = initialImpactState();
  #muted = false;
  #disposed = false;
  #noise: AudioBuffer | null;

  constructor() {
    // A short looping white‑noise buffer for the tyre/wind/impact beds. Built lazily inside
    // unlock() when a context exists; null in headless.
    this.#noise = null;
  }

  get isUnlocked(): boolean {
    return this.#ctx !== null;
  }

  get isMuted(): boolean {
    return this.#muted;
  }

  /** Create + start the graph. Must be called from a user gesture (autoplay policy). Idempotent. */
  unlock(): void {
    if (this.#disposed) return;
    if (this.#ctx !== null) {
      void this.#ctx.resume().catch(() => {});
      return;
    }
    const Ctor = audioContextCtor();
    if (Ctor === null) return; // headless: stay silent, no‑op for life.
    const ctx = new Ctor();
    this.#buildGraph(ctx);
    this.#ctx = ctx;
    void ctx.resume().catch(() => {});
  }

  #buildGraph(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = this.#muted ? 0 : 0.8;
    master.connect(ctx.destination);
    this.#master = master;

    // Looping white‑noise buffer (2 s) shared by the tyre, wind and impact beds.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.#noise = noise;

    // Engine bed: a saw + a sub‑octave square, low‑passed, through its own gain.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 750;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = engineFreqFromRpm(IDLE_RPM);
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = engineFreqFromRpm(IDLE_RPM) * 0.5;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    osc1.connect(engineFilter);
    osc2.connect(subGain);
    subGain.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    osc1.start();
    osc2.start();
    this.#engineOsc1 = osc1;
    this.#engineOsc2 = osc2;
    this.#engineGain = engineGain;

    // Tyre squawk bed: noise → bandpass → gain.
    const skidSource = ctx.createBufferSource();
    skidSource.buffer = noise;
    skidSource.loop = true;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.value = 1000;
    skidFilter.Q.value = 0.8;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidSource.connect(skidFilter);
    skidFilter.connect(skidGain);
    skidGain.connect(master);
    skidSource.start();
    this.#skidGain = skidGain;
    this.#skidFilter = skidFilter;

    // Wind/road‑rush bed: noise → lowpass → gain.
    const windSource = ctx.createBufferSource();
    windSource.buffer = noise;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();
    this.#windGain = windGain;
  }

  /** Called once per frame with live telemetry; shapes the always‑on beds and fires impacts. */
  setTelemetry(telemetry: VehicleTelemetry, nowMs: number): void {
    const ctx = this.#ctx;
    if (ctx === null || this.#disposed) return;
    const ct = ctx.currentTime;
    const muted = this.#muted;

    if (this.#engineOsc1 !== null && this.#engineOsc2 !== null && this.#engineGain !== null) {
      const freq =
        telemetry.gear > 0 ? engineFreqFromRpm(telemetry.rpm) : engineFreqFromRpm(IDLE_RPM);
      this.#engineOsc1.frequency.setTargetAtTime(freq, ct, 0.04);
      this.#engineOsc2.frequency.setTargetAtTime(freq * 0.5, ct, 0.04);
      this.#engineGain.gain.setTargetAtTime(muted ? 0 : engineGain(telemetry) * 0.5, ct, 0.06);
    }
    if (this.#skidGain !== null && this.#skidFilter !== null) {
      const skid = muted ? 0 : skidGain(telemetry) * 0.45;
      this.#skidGain.gain.setTargetAtTime(skid, ct, 0.04);
      this.#skidFilter.frequency.setTargetAtTime(
        800 + Math.abs(telemetry.slipAngle) * 900,
        ct,
        0.05,
      );
    }
    if (this.#windGain !== null) {
      this.#windGain.gain.setTargetAtTime(muted ? 0 : windGain(telemetry) * 0.4, ct, 0.25);
    }

    // Impact thud (crash / hard scrape) — independent of the continuous beds.
    const impact = detectImpact(this.#impactState, telemetry, nowMs);
    this.#impactState = impact.state;
    if (impact.intensity > 0 && !muted) {
      this.playImpact(impact.intensity);
    }
  }

  /** A thud + noise burst scaled by impact intensity (0..1). */
  playImpact(intensity: number): void {
    const ctx = this.#ctx;
    if (ctx === null || this.#noise === null || this.#master === null) return;
    const ct = ctx.currentTime;
    const level = clamp(intensity, 0, 1);

    // Low thud: a sine dropping in pitch, fast decay.
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(72, ct);
    thud.frequency.exponentialRampToValueAtTime(38, ct + 0.2);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.0001, ct);
    thudGain.gain.linearRampToValueAtTime(0.7 * level, ct + 0.01);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, ct + 0.22);
    thud.connect(thudGain);
    thudGain.connect(this.#master);
    thud.start(ct);
    thud.stop(ct + 0.25);

    // Noise crunch: a short, low‑passed burst.
    const burst = ctx.createBufferSource();
    burst.buffer = this.#noise;
    const burstFilter = ctx.createBiquadFilter();
    burstFilter.type = 'lowpass';
    burstFilter.frequency.value = 320;
    const burstGain = ctx.createGain();
    burstGain.gain.setValueAtTime(0.0001, ct);
    burstGain.gain.linearRampToValueAtTime(0.85 * level, ct + 0.008);
    burstGain.gain.exponentialRampToValueAtTime(0.0001, ct + 0.24);
    burst.connect(burstFilter);
    burstFilter.connect(burstGain);
    burstGain.connect(this.#master);
    burst.start(ct);
    burst.stop(ct + 0.28);
  }

  /** A one‑shot stinger melody (or a noise whoosh for `boost`). */
  playStinger(kind: StingerKind): void {
    const ctx = this.#ctx;
    if (ctx === null || this.#master === null) return;
    if (kind === 'boost') {
      this.playWhoosh();
      return;
    }
    const notes = stingerNotes(kind);
    const dur = stingerNoteDurationMs(kind) / 1000;
    const start = ctx.currentTime;
    notes.forEach((freq, i) => {
      const t0 = start + i * dur;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.#master!);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    });
  }

  /** A rising noise sweep — the nitro whoosh. */
  playWhoosh(): void {
    const ctx = this.#ctx;
    if (ctx === null || this.#noise === null || this.#master === null) return;
    const ct = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.#noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(300, ct);
    filter.frequency.exponentialRampToValueAtTime(2400, ct + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ct);
    g.gain.linearRampToValueAtTime(0.5, ct + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, ct + 0.5);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.#master);
    src.start(ct);
    src.stop(ct + 0.55);
  }

  /** A short UI blip (menu clicks). */
  playUiClick(): void {
    const ctx = this.#ctx;
    if (ctx === null || this.#master === null) return;
    const ct = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = UI_CLICK_HZ;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ct);
    g.gain.linearRampToValueAtTime(0.22, ct + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, ct + 0.05);
    osc.connect(g);
    g.connect(this.#master);
    osc.start(ct);
    osc.stop(ct + 0.06);
  }

  /** A two‑note UI open (menus opening). */
  playUiOpen(): void {
    const ctx = this.#ctx;
    if (ctx === null || this.#master === null) return;
    const start = ctx.currentTime;
    UI_OPEN_NOTES.forEach((freq, i) => {
      const t0 = start + i * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.25, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
      osc.connect(g);
      g.connect(this.#master!);
      osc.start(t0);
      osc.stop(t0 + 0.09);
    });
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    if (this.#master !== null && this.#ctx !== null) {
      this.#master.gain.setTargetAtTime(muted ? 0 : 0.8, this.#ctx.currentTime, 0.03);
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      this.#engineOsc1?.stop();
      this.#engineOsc2?.stop();
    } catch {
      /* already stopped */
    }
    if (this.#ctx !== null) {
      void this.#ctx.close().catch(() => {});
    }
    this.#ctx = null;
    this.#master = null;
    this.#engineOsc1 = null;
    this.#engineOsc2 = null;
    this.#engineGain = null;
    this.#skidGain = null;
    this.#skidFilter = null;
    this.#windGain = null;
  }
}
