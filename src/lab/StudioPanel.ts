/**
 * The studio's control surface and readout.
 *
 * Deliberately DOM rather than in-world: every control here changes what the *renderer* is doing
 * rather than the world, and a panel that cannot cover the thing being judged is the right shape for
 * a screen whose entire purpose is looking closely at surfaces. It is also the same markup on a
 * phone, which is where half of these judgements will eventually happen.
 */
export interface StudioPanelState {
  readonly environments: readonly { readonly id: string; readonly name: string }[];
  readonly environmentIndex: number;
  readonly environmentEnabled: boolean;
  readonly environmentId: string | null;
  readonly rotationDegrees: number;
  readonly timeLabel: string;
  readonly sunElevationDegrees: number | null;
  readonly isNight: boolean;
  readonly materialCount: number;
  readonly hasScannedSurface: boolean;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly tierId: string;
  readonly tierReason: string;
  readonly backend: string | null;
  readonly postEffects: readonly string[];
  /** Look LUT in force (`17³`) or `null` when the frame is ungraded. */
  readonly look: string | null;
  /** Depth-of-field focus distance in metres, or `null` when the effect is not in the chain. */
  readonly focusDistance: number | null;
}

export interface StudioPanelOptions {
  readonly root: HTMLElement;
  readonly onChange: (action: StudioPanelAction) => void;
}

import { STUDIO_CONFIG } from '../config/studio';

/** Every control the panel can raise. A union so the application's switch over it stays exhaustive. */
export type StudioPanelAction =
  | 'hour-back'
  | 'hour-forward'
  | 'environment-next'
  | 'environment-toggle'
  | 'rotation-back'
  | 'rotation-forward'
  | 'reset-camera'
  | 'toggle-panel';

/** Keyboard shortcuts, so the studio can be driven from the keyboard without hunting for buttons. */
const KEY_BINDINGS: readonly { readonly key: string; readonly action: StudioPanelAction }[] = [
  { key: 'p', action: 'toggle-panel' },
  { key: 'ArrowLeft', action: 'hour-back' },
  { key: 'ArrowRight', action: 'hour-forward' },
  { key: 'h', action: 'environment-next' },
  { key: 'e', action: 'environment-toggle' },
  { key: ',', action: 'rotation-back' },
  { key: '.', action: 'rotation-forward' },
  { key: 'r', action: 'reset-camera' },
];

export class StudioPanel {
  readonly #root: HTMLElement;
  readonly #onChange: (action: StudioPanelAction) => void;
  readonly #readout: HTMLElement;
  readonly #environmentName: HTMLElement;
  readonly #onKeyDown: (event: KeyboardEvent) => void;

  /** The DOM node the panel occupies; used to measure how much of the frame it covers. */
  get element(): HTMLElement {
    return this.#root;
  }

  constructor(options: StudioPanelOptions) {
    this.#root = options.root;
    this.#onChange = options.onChange;

    this.#root.innerHTML = '';
    this.#root.classList.add('studio-panel');

    const header = document.createElement('h2');
    header.textContent = 'Material studio';

    const scale = document.createElement('p');
    scale.className = 'studio-scale';
    // Derived from the configuration rather than written here: a caption that disagrees with the
    // scene it describes is worse than no caption.
    scale.textContent =
      `${(STUDIO_CONFIG.sphereRadius * 2).toFixed(2)} m spheres, ` +
      `${STUDIO_CONFIG.spacing.toFixed(2)} m apart, on a ` +
      `${(STUDIO_CONFIG.floorSize / 2).toFixed(0)} m floor.`;

    this.#readout = document.createElement('dl');
    this.#readout.className = 'studio-readout';

    this.#environmentName = document.createElement('p');
    this.#environmentName.className = 'studio-environment';

    const controls = document.createElement('div');
    controls.className = 'studio-controls';

    CONTROL_LABELS.forEach(({ label, action, title }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.dataset['action'] = action;
      button.addEventListener('click', () => {
        this.#onChange(action);
      });
      controls.append(button);
    });

    this.#root.append(header, scale, this.#environmentName, this.#readout, controls);

    this.#onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      // Matched without case, as in the prop panel: one panel whose shortcuts survive Caps Lock and
      // another whose shortcuts do not is worse than either rule on its own.
      const pressed = event.key.toLowerCase();
      const binding = KEY_BINDINGS.find((candidate) => candidate.key.toLowerCase() === pressed);
      if (binding === undefined) {
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

  update(state: StudioPanelState): void {
    const environment = state.environments[state.environmentIndex] ?? null;
    this.#environmentName.textContent = state.environmentEnabled
      ? `Environment: ${environment?.name ?? state.environmentId ?? 'none'}`
      : 'Environment: off — sun and sky only';
    this.#environmentName.dataset['off'] = state.environmentEnabled ? 'false' : 'true';

    const sun = state.sunElevationDegrees;
    const rows: readonly [string, string][] = [
      [
        'Time',
        `${state.timeLabel}${sun === null ? '' : ` · sun ${sun.toFixed(0)}°`}${state.isNight ? ' · night' : ''}`,
      ],
      [
        'Materials',
        `${state.materialCount}${state.hasScannedSurface ? ' · scanned surface applied' : ''}`,
      ],
      ['Env rotation', `${state.rotationDegrees.toFixed(0)}°`],
      ['Tier', `${state.tierId} · ${state.tierReason}`],
      ['Renderer', `${state.backend ?? 'starting'} · ${state.postEffects.join(' → ') || 'direct'}`],
      ['Frame', `${state.drawCalls} draw calls · ${state.triangles.toLocaleString('en-US')} tris`],
    ];
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
    this.#root.classList.remove('studio-panel');
  }
}

const CONTROL_LABELS: readonly {
  readonly label: string;
  readonly action: StudioPanelAction;
  readonly title: string;
}[] = [
  { label: '◀ hour', action: 'hour-back', title: 'Half an hour earlier (Left arrow)' },
  { label: 'hour ▶', action: 'hour-forward', title: 'Half an hour later (Right arrow)' },
  { label: 'Next HDRI', action: 'environment-next', title: 'Cycle the environment map (H)' },
  { label: 'HDRI on/off', action: 'environment-toggle', title: 'Compare with and without IBL (E)' },
  { label: '↺ rotate', action: 'rotation-back', title: 'Rotate the environment 15° (comma)' },
  { label: 'rotate ↻', action: 'rotation-forward', title: 'Rotate the environment 15° (period)' },
  { label: 'Reset view', action: 'reset-camera', title: 'Reframe the grid (R)' },
  { label: 'Hide panel', action: 'toggle-panel', title: 'Hide this panel for a clean frame (P)' },
];
