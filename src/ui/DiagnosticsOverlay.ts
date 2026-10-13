/**
 * Phase 1 diagnostics HUD.
 *
 * The overlay only touches the DOM when `update` is called on the application's HUD
 * interval, keeping per-frame work out of the render loop. All values are formatted
 * from the snapshot; nothing here reads engine internals directly.
 */
export interface DiagnosticsSnapshot {
  readonly framesPerSecond: number;
  readonly minimumFramesPerSecond: number;
  readonly averageFrameTimeMilliseconds: number;
  readonly p95FrameTimeMilliseconds: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly pixelRatio: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly cameraPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly sceneObjects: number;
  readonly totalFrames: number;
}

export interface DiagnosticsOverlayOptions {
  readonly root: HTMLElement;
  readonly subtitle?: string;
}

interface RowDefinition {
  readonly label: string;
  readonly format: (snapshot: DiagnosticsSnapshot) => string;
}

const ROW_DEFINITIONS: readonly RowDefinition[] = [
  {
    label: 'FPS',
    format: (snapshot) => `${snapshot.framesPerSecond.toFixed(1)} avg`,
  },
  {
    label: 'FPS low',
    format: (snapshot) => `${snapshot.minimumFramesPerSecond.toFixed(1)} worst`,
  },
  {
    label: 'Frame',
    format: (snapshot) => `${snapshot.averageFrameTimeMilliseconds.toFixed(2)} ms`,
  },
  {
    label: 'Frame p95',
    format: (snapshot) => `${snapshot.p95FrameTimeMilliseconds.toFixed(2)} ms`,
  },
  {
    label: 'Viewport',
    format: (snapshot) =>
      `${snapshot.viewport.width}×${snapshot.viewport.height} @ ${snapshot.pixelRatio.toFixed(2)}x`,
  },
  { label: 'Draw calls', format: (snapshot) => String(snapshot.drawCalls) },
  { label: 'Triangles', format: (snapshot) => snapshot.triangles.toLocaleString('en-US') },
  { label: 'Scene objects', format: (snapshot) => String(snapshot.sceneObjects) },
  {
    label: 'Camera',
    format: (snapshot) =>
      `${snapshot.cameraPosition.x.toFixed(1)}, ${snapshot.cameraPosition.y.toFixed(1)}, ${snapshot.cameraPosition.z.toFixed(1)}`,
  },
  { label: 'Frames', format: (snapshot) => snapshot.totalFrames.toLocaleString('en-US') },
];

const PANEL_CLASSES = [
  'pointer-events-none',
  'absolute',
  'top-3',
  'left-3',
  'select-none',
  'rounded-xl',
  'border',
  'border-white/10',
  'bg-slate-950/70',
  'px-3',
  'py-2',
  'font-mono',
  'text-[11px]',
  'leading-5',
  'tabular-nums',
  'text-slate-200',
  'shadow-lg',
  'backdrop-blur-sm',
].join(' ');

const LABEL_CLASSES = 'text-slate-400';
const VALUE_CLASSES = 'text-right text-teal-200';

export class DiagnosticsOverlay {
  readonly #panel: HTMLElement;
  readonly #valueNodes: readonly HTMLElement[];
  #disposed = false;

  constructor(options: DiagnosticsOverlayOptions) {
    this.#panel = document.createElement('section');
    this.#panel.className = PANEL_CLASSES;
    this.#panel.setAttribute('aria-hidden', 'true');

    const heading = document.createElement('p');
    heading.className = 'mb-1 font-sans text-[10px] font-semibold tracking-[0.18em] uppercase';
    heading.textContent = options.subtitle ?? 'Phase 1 · scene foundation';
    heading.classList.add('text-teal-300');
    this.#panel.append(heading);

    const list = document.createElement('dl');
    list.className = 'grid grid-cols-[auto_auto] gap-x-4';

    const valueNodes: HTMLElement[] = [];
    for (const row of ROW_DEFINITIONS) {
      const term = document.createElement('dt');
      term.className = LABEL_CLASSES;
      term.textContent = row.label;

      const value = document.createElement('dd');
      value.className = VALUE_CLASSES;
      value.textContent = '—';

      list.append(term, value);
      valueNodes.push(value);
    }

    this.#panel.append(list);
    this.#valueNodes = valueNodes;
    options.root.append(this.#panel);
  }

  get element(): HTMLElement {
    return this.#panel;
  }

  update(snapshot: DiagnosticsSnapshot): void {
    if (this.#disposed) {
      return;
    }
    ROW_DEFINITIONS.forEach((row, index) => {
      const node = this.#valueNodes[index];
      if (node) {
        node.textContent = row.format(snapshot);
      }
    });
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#panel.remove();
  }
}
