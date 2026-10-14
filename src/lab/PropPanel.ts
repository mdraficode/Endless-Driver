import { PROPS_CONFIG } from '../config/props';

/**
 * The prop scene's control surface and readout.
 *
 * Same shape as the studio's panel, for the same reason: every control here changes what the
 * *renderer* is doing rather than the world, so it belongs in the DOM where it can be read at a glance
 * and cannot be confused for part of the scene. Unlike the studio's, this one is mostly a readout — the
 * numbers under each level are the artefact being inspected, and they are the same numbers the CI
 * budget gate checks.
 */
export interface PropPanelLevel {
  readonly level: number;
  readonly node: string;
  readonly triangles: number;
  readonly seamMerged: boolean;
}

export interface PropPanelState {
  readonly modelName: string;
  readonly modelId: string;
  readonly licence: string;
  readonly creator: string;
  /** Bytes of the single file holding every level. */
  readonly bytes: number;
  readonly radius: number;
  readonly levels: readonly PropPanelLevel[];
  /** Level switched to by the distance rule in automatic mode. */
  readonly autoLevel: number | null;
  /** Level isolated when the panel is in `isolated` mode. */
  readonly isolatedLevel: number | null;
  readonly mode: 'lineup' | 'isolated' | 'auto';
  /** Distance from the camera to the model, in metres, and the resulting level. */
  readonly cameraDistance: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly timeLabel: string;
  readonly sunElevationDegrees: number | null;
  readonly tierId: string;
  readonly backend: string | null;
  readonly postEffects: readonly string[];
  /** Look LUT in force (`17³`) or `null` when the frame is ungraded. */
  readonly look: string | null;
  /** Depth-of-field focus distance in metres, or `null` when the effect is not in the chain. */
  readonly focusDistance: number | null;
  /** Reported when the model never arrived, so the panel explains an empty scene. */
  readonly error: string | null;
}

/** Every control the panel can raise. A union, so the application's switch over it stays exhaustive. */
export type PropPanelAction =
  | 'show-lineup'
  | 'level-0'
  | 'level-1'
  | 'level-2'
  | 'level-next'
  | 'auto-toggle'
  | 'hour-back'
  | 'hour-forward'
  | 'reset-camera'
  | 'toggle-panel';

const KEY_BINDINGS: readonly { readonly key: string; readonly action: PropPanelAction }[] = [
  { key: '1', action: 'level-0' },
  { key: '2', action: 'level-1' },
  { key: '3', action: 'level-2' },
  { key: 'l', action: 'show-lineup' },
  { key: 'a', action: 'auto-toggle' },
  { key: 'n', action: 'level-next' },
  { key: 'ArrowLeft', action: 'hour-back' },
  { key: 'ArrowRight', action: 'hour-forward' },
  { key: 'r', action: 'reset-camera' },
  { key: 'p', action: 'toggle-panel' },
];

export interface PropPanelOptions {
  readonly root: HTMLElement;
  readonly onChange: (action: PropPanelAction) => void;
}

export class PropPanel {
  readonly #root: HTMLElement;
  readonly #onChange: (action: PropPanelAction) => void;
  readonly #title: HTMLElement;
  readonly #subtitle: HTMLElement;
  readonly #levels: HTMLElement;
  readonly #readout: HTMLElement;
  readonly #onKeyDown: (event: KeyboardEvent) => void;
  /** Buttons that only make sense once a model with levels is loaded. */
  readonly #levelButtons: HTMLButtonElement[] = [];
  #hasLevels = false;

  /** The DOM node the panel occupies; used to measure how much of the frame it covers. */
  get element(): HTMLElement {
    return this.#root;
  }

  constructor(options: PropPanelOptions) {
    this.#root = options.root;
    this.#onChange = options.onChange;

    this.#root.innerHTML = '';
    this.#root.classList.add('studio-panel', 'prop-panel');

    const header = document.createElement('h2');
    header.textContent = 'Prop inspector';

    this.#title = document.createElement('p');
    this.#title.className = 'studio-scale';

    this.#subtitle = document.createElement('p');
    this.#subtitle.className = 'studio-environment';

    this.#levels = document.createElement('dl');
    this.#levels.className = 'prop-levels';

    this.#readout = document.createElement('dl');
    this.#readout.className = 'studio-readout';

    const controls = document.createElement('div');
    controls.className = 'studio-controls';
    for (const { label, action, title } of CONTROL_LABELS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.dataset['action'] = action;
      // Controls that need levels to act on are hidden until there are some. A button that silently
      // does nothing is worse than a button that is not there: the first reads as a bug in the level
      // switching, and the second reads as "nothing has loaded yet", which is the truth.
      if (LEVEL_CONTROLS.has(action)) {
        button.hidden = true;
        this.#levelButtons.push(button);
      }
      button.addEventListener('click', () => {
        this.#onChange(action);
      });
      controls.append(button);
    }

    this.#root.append(header, this.#title, this.#subtitle, this.#levels, this.#readout, controls);

    this.#onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      // Matched without case, so Caps Lock and a held Shift are not a way to break every shortcut.
      // `ArrowLeft` and friends have no case, so folding both sides is safe for the whole table.
      const pressed = event.key.toLowerCase();
      const binding = KEY_BINDINGS.find((candidate) => candidate.key.toLowerCase() === pressed);
      if (binding === undefined) {
        return;
      }
      // The same rule as the buttons: a shortcut for a control that is not there is not a shortcut.
      if (!this.#hasLevels && LEVEL_CONTROLS.has(binding.action)) {
        return;
      }
      event.preventDefault();
      this.#onChange(binding.action);
    };
    window.addEventListener('keydown', this.#onKeyDown);
  }

  /** Hides or shows everything except the toggle, so a clean frame is one keystroke away. */
  setCollapsed(collapsed: boolean): void {
    this.#root.dataset['collapsed'] = collapsed ? 'true' : 'false';
  }

  get isCollapsed(): boolean {
    return this.#root.dataset['collapsed'] === 'true';
  }

  update(state: PropPanelState): void {
    const hasLevels = state.levels.length > 0;
    this.#hasLevels = hasLevels;
    for (const button of this.#levelButtons) {
      button.hidden = !hasLevels;
    }
    this.#title.textContent =
      `${state.modelName} — ${formatBytes(state.bytes)} in one file, ` +
      `${state.levels.length} level${state.levels.length === 1 ? '' : 's'} of detail, ` +
      `radius ${state.radius.toFixed(2)} m.`;
    this.#subtitle.textContent = `CC0 — ${state.creator}`;
    this.#subtitle.dataset['off'] = 'false';

    this.#levels.replaceChildren(
      ...state.levels.flatMap((level) => {
        const term = document.createElement('dt');
        const showing =
          (state.mode === 'isolated' && level.level === state.isolatedLevel) ||
          (state.mode === 'auto' && level.level === state.autoLevel);
        term.textContent = `${level.node}${showing ? ' ●' : ''}`;
        term.dataset['active'] = showing ? 'true' : 'false';
        const value = document.createElement('dd');
        value.textContent =
          `${level.triangles.toLocaleString('en-US')} tris` +
          (level.seamMerged ? ' · seams merged' : '');
        return [term, value];
      }),
    );

    const rows: [string, string][] = [
      ['Mode', describeMode(state)],
      ['Camera', `${state.cameraDistance.toFixed(1)} m`],
      [
        'Time',
        `${state.timeLabel}${state.sunElevationDegrees === null ? '' : ` · sun ${state.sunElevationDegrees.toFixed(0)}°`}`,
      ],
      ['Tier', state.tierId],
      ['Renderer', `${state.backend ?? 'starting'} · ${state.postEffects.join(' → ') || 'direct'}`],
      ['Frame', `${state.drawCalls} draw calls · ${state.triangles.toLocaleString('en-US')} tris`],
    ];
    if (state.error !== null) {
      rows.push(['Problem', state.error]);
    }
    this.#readout.replaceChildren(
      ...rows.flatMap(([term, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = term;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#onKeyDown);
    this.#root.replaceChildren();
    this.#root.classList.remove('studio-panel', 'prop-panel');
  }
}

function describeMode(state: PropPanelState): string {
  switch (state.mode) {
    case 'lineup':
      return `all levels side by side (${PROPS_CONFIG.gapFactor}× radius apart)`;
    case 'isolated': {
      const level = state.levels.find((candidate) => candidate.level === state.isolatedLevel);
      return `isolated: ${level?.node ?? '—'} at ${(level?.triangles ?? 0).toLocaleString('en-US')} tris`;
    }
    case 'auto':
      return 'automatic — the level follows camera distance';
  }
}

/** Byte count in the units a person reads, with one decimal where it matters. */
function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(2)} MB`;
  }
  if (bytes >= 1000) {
    return `${(bytes / 1000).toFixed(0)} kB`;
  }
  return `${bytes} B`;
}

/** Controls that act on the level chain and therefore need one to exist. */
const LEVEL_CONTROLS = new Set<PropPanelAction>([
  'show-lineup',
  'level-0',
  'level-1',
  'level-2',
  'level-next',
  'auto-toggle',
]);

const CONTROL_LABELS: readonly {
  readonly label: string;
  readonly action: PropPanelAction;
  readonly title: string;
}[] = [
  { label: 'All levels', action: 'show-lineup', title: 'Show every level side by side (L)' },
  { label: 'LOD 0', action: 'level-0', title: 'Isolate the closest level (1)' },
  { label: 'LOD 1', action: 'level-1', title: 'Isolate the middle level (2)' },
  { label: 'LOD 2', action: 'level-2', title: 'Isolate the deepest level (3)' },
  { label: 'Next level', action: 'level-next', title: 'Step to the next level of detail (N)' },
  {
    label: 'Auto distance',
    action: 'auto-toggle',
    title: 'Let camera distance pick the level (A) — the rule the streamed world uses',
  },
  { label: '◀ hour', action: 'hour-back', title: 'Half an hour earlier (Left arrow)' },
  { label: 'hour ▶', action: 'hour-forward', title: 'Half an hour later (Right arrow)' },
  { label: 'Reset view', action: 'reset-camera', title: 'Reframe the lineup (R)' },
  { label: 'Hide panel', action: 'toggle-panel', title: 'Hide this panel for a clean frame (P)' },
];
