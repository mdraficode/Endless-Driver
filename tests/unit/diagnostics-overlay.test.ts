import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiagnosticsOverlay, type DiagnosticsSnapshot } from '../../src/ui/DiagnosticsOverlay';

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
  qualityTier: 'C',
  tierReason: 'mobile',
  timeOfDay: '12:00',
  sunElevationDegrees: 45,
  isNight: false,
  rendererBackend: 'webgl2',
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
    expect(grid.children).toHaveLength(28);
    expect(grid.children.every((metric) => metric.children.length === 2)).toBe(true);

    const labels = grid.children.map((metric) => metric.children[0]?.textContent);
    for (const label of ['Viewport', 'Tier', 'Renderer', 'Resolution']) {
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
    expect([...report.values()].every((value) => value !== '—')).toBe(true);

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
