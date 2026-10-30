import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DiagnosticsOverlay,
  formatStartupTimings,
  type DiagnosticsSnapshot,
} from '../../src/ui/DiagnosticsOverlay';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly classList = {
    add: (name: string) => {
      this.className = `${this.className} ${name}`.trim();
    },
  };
  className = '';
  textContent = '';
  hidden = false;
  type = '';
  removed = false;

  constructor(readonly tagName: string) {}

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  remove(): void {
    this.removed = true;
  }
}

const SNAPSHOT = {
  framesPerSecond: 61.2,
  minimumFramesPerSecond: 24.3,
  averageFrameTimeMilliseconds: 16.3,
  p95FrameTimeMilliseconds: 31,
  drawCalls: 123,
  triangles: 456_789,
  startup: [
    { stage: 'total', ms: 94_000 },
    { stage: 'terrain', ms: 2_000 },
    { stage: 'car', ms: 5_400 },
    { stage: 'surfaces', ms: 68_000 },
    { stage: 'compile', ms: 9_000 },
    { stage: 'carFX', ms: 1_200 },
    { stage: 'settle', ms: 5_000 },
    { stage: 'physics', ms: 3_400 },
  ],
  qualityTier: 'C',
  tierReason: 'mobile',
  timeOfDay: '12:00',
  sunElevationDegrees: 45,
  isNight: false,
  rendererBackend: 'webgl2',
  graphicsLost: false,
  warmupComplete: true,
  frameErrors: { count: 0, last: null },
  particleSimulation: 'webgl2-disabled',
  postProcessing: true,
  antialiasing: 'fxaa',
  postEffects: ['fxaa', 'tone'],
  look: '17³',
  focusDistance: null,
  renderScale: 0.9,
  shadowCascades: 1,
  skyMode: 'procedural',
  environmentId: null,
  fogMode: 'off',
  spawnId: 'yuhhi-town',
  spawnLabel: 'Yūhi Town',
  pixelRatio: 1,
  viewport: { width: 1536, height: 704 },
  cameraPosition: { x: 1, y: 2, z: 3 },
  sceneObjects: 17,
  contentStats: {
    terrainChunksLoaded: 3,
    terrainChunksDesired: 5,
    terrainBuildsPending: 1,
    terrainTriangles: 100_000,
  },
  totalFrames: 300,
  cameraMode: 'chase',
  cameraView: 'Normal',
  cameraOrbit: { yawDegrees: 0, pitchDegrees: 0 },
  cameraFov: 68,
  speedKph: 72,
  forwardSpeed: 20,
  gear: 4,
  rpm: 3210,
  throttle: 0.5,
  brake: 0,
  handbrake: false,
  steerAngleDegrees: 5,
  contactCount: 4,
  weather: 'clear',
  wetness: 0,
  averageSurfaceGripModifier: 1,
  averageSurfaceRollingResistance: 0.015,
  drifting: false,
  slipAngleDegrees: 2,
  distanceMeters: 1245,
  physicsSteps: 1,
  physicsBodies: 23,
  physicsStalledFrames: 0,
  physicsElapsedSeconds: 300,
  carHeadingDegrees: 0,
  carPosition: { x: 1, y: 2, z: 3 },
  wheelSteerDegrees: [0, 0, 0, 0],
  wheelSpinRadians: [0, 0, 0, 0],
} satisfies DiagnosticsSnapshot;

function installFakeDocument(): void {
  vi.stubGlobal('document', {
    createElement: (tagName: string) => new FakeElement(tagName) as unknown as HTMLElement,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('full-screen diagnostics report', () => {
  it('shows every telemetry field in an accessible report and keeps critical render rows', () => {
    installFakeDocument();
    const root = new FakeElement('root');
    const overlay = new DiagnosticsOverlay({
      root: root as unknown as HTMLElement,
      initiallyVisible: true,
    });
    const panel = root.children[0]!;
    const grid = panel.children[1]!;

    expect(panel.className).toContain('diagnostics-panel');
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-label')).toBe('Live diagnostics report');
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(grid.className).toBe('diagnostics-grid');
    expect(grid.children).toHaveLength(34);
    expect(grid.children.every((metric) => metric.children.length === 2)).toBe(true);

    const labels = grid.children.map((metric) => metric.children[0]?.textContent);
    for (const label of ['Viewport', 'Tier', 'Renderer', 'Resolution', 'Weather', 'Surface']) {
      expect(labels).toContain(label);
    }

    overlay.update(SNAPSHOT);
    const report = new Map(
      grid.children.map((metric) => [
        metric.children[0]?.textContent,
        metric.children[1]?.textContent,
      ]),
    );
    expect(report.get('Viewport')).toBe('1536×704 @ 1.00x');
    expect(report.get('Tier')).toBe('C · mobile · 1x shadow');
    expect(report.get('Renderer')).toBe('webgl2 · fxaa');
    expect(report.get('Resolution')).toBe('fxaa @ 90%');
    expect(report.get('Weather')).toBe('clear · dry');
    expect(report.get('Surface')).toBe('grip 1.00× · RR 0.0150');
    expect(report.get('Graphics')).toBe('ok');
    expect(report.get('Frame errors')).toBe('none');
    expect([...report.values()].every((value) => value !== '—')).toBe(true);

    overlay.update({
      ...SNAPSHOT,
      weather: 'rain',
      wetness: 0.85,
      averageSurfaceGripModifier: 0.813,
      averageSurfaceRollingResistance: 0.0184,
    });
    const rainReport = new Map(
      grid.children.map((metric) => [
        metric.children[0]?.textContent,
        metric.children[1]?.textContent,
      ]),
    );
    expect(rainReport.get('Weather')).toBe('rain · 85% wet');
    expect(rainReport.get('Surface')).toBe('grip 0.81× · RR 0.0184');

    // A frame-handler exception is surfaced on its own row so a returning device report
    // shows exactly what failed without guessing.
    overlay.update({ ...SNAPSHOT, frameErrors: { count: 2, last: 'boom' } });
    const errorReport = new Map(
      grid.children.map((metric) => [
        metric.children[0]?.textContent,
        metric.children[1]?.textContent,
      ]),
    );
    expect(errorReport.get('Frame errors')).toBe('2 · boom');

    // A lost graphics context (loop stopped over a frozen frame) is called out so a returning
    // device report proves the freeze cause.
    overlay.update({ ...SNAPSHOT, graphicsLost: true });
    const lostReport = new Map(
      grid.children.map((metric) => [
        metric.children[0]?.textContent,
        metric.children[1]?.textContent,
      ]),
    );
    expect(lostReport.get('Graphics')).toBe('LOST — reload');

    // The startup stage breakdown is the instrument for "loading takes too long" reports: it
    // says whether the wall clock went to the network stages or the GPU stages.
    expect(lostReport.get('Startup')).toBe(
      'total 94s · terrain 2s · car 5.4s · surfaces 68s · compile 9s · carFX 1.2s · settle 5s · physics 3.4s',
    );

    // A main compile pass that had to be cut off before the first frame is called out so a
    // returning device report can prove "the freeze is the warm-up running out of budget".
    expect(lostReport.get('Warmup')).toBe('done');
    overlay.update({ ...SNAPSHOT, warmupComplete: false });
    const partialReport = new Map(
      grid.children.map((metric) => [
        metric.children[0]?.textContent,
        metric.children[1]?.textContent,
      ]),
    );
    expect(partialReport.get('Warmup')).toBe('partial — may jank');

    overlay.dispose();
    expect(panel.removed).toBe(true);
  });

  it('updates hidden accessibility state and closes from the full-screen close button', () => {
    installFakeDocument();
    const root = new FakeElement('root');
    const onClose = vi.fn();
    const overlay = new DiagnosticsOverlay({
      root: root as unknown as HTMLElement,
      initiallyVisible: false,
      onClose,
    });
    const panel = root.children[0]!;
    const header = panel.children[0]!;
    const closeButton = header.children[1]!;

    expect(panel.hidden).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('true');

    overlay.setVisible(true);
    expect(panel.hidden).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('false');

    closeButton.listeners.get('click')?.();
    expect(panel.hidden).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(onClose).toHaveBeenCalledOnce();

    overlay.dispose();
  });
});

describe('startup timing formatting', () => {
  it('reads as total first, then the stages in start() order, with sub-10 s precision', () => {
    expect(formatStartupTimings([])).toBe('in progress…');
    expect(
      formatStartupTimings([
        { stage: 'total', ms: 12_300 },
        { stage: 'terrain', ms: 900 },
        { stage: 'car', ms: 1_200 },
        { stage: 'surfaces', ms: 500 },
        { stage: 'compile', ms: 11_000 },
        { stage: 'carFX', ms: 1_000 },
        { stage: 'settle', ms: 200 },
        { stage: 'physics', ms: 100 },
      ]),
    ).toBe(
      'total 12s · terrain 0.9s · car 1.2s · surfaces 0.5s · compile 11s · carFX 1s · settle 0.2s · physics 0.1s',
    );
  });

  it('omits stages that were never reached (a failed startup)', () => {
    expect(
      formatStartupTimings([
        { stage: 'total', ms: 30_000 },
        { stage: 'terrain', ms: 2_000 },
        { stage: 'car', ms: 8_000 },
        { stage: 'surfaces', ms: 20_000 },
      ]),
    ).toBe('total 30s · terrain 2s · car 8s · surfaces 20s');
  });

  it('appends the network bill: wire bytes, download window, and the implied rate', () => {
    // 15.9 MB over 44 s — a throttled phone link: the rate is the number that says
    // "the load is the link", not the GPU.
    expect(
      formatStartupTimings(
        [
          { stage: 'total', ms: 52_000 },
          { stage: 'surfaces', ms: 40_000 },
        ],
        { bytes: 15.9 * 1024 * 1024, ms: 44_000 },
      ),
    ).toBe('total 52s · surfaces 40s · net 15.9 MB in 44s (0.36 MB/s)');
  });

  it('omits the network part when it is unavailable or the window is empty', () => {
    const stages = [{ stage: 'total', ms: 12_000 }];
    expect(formatStartupTimings(stages, null)).toBe('total 12s');
    expect(formatStartupTimings(stages, undefined)).toBe('total 12s');
    expect(formatStartupTimings(stages, { bytes: 1024 * 1024, ms: 0 })).toBe('total 12s');
  });
});
