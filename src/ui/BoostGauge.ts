import type { NitroBoostState } from '../vehicles/NitroBoost';
import { clamp } from '../shared/math';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const TANK_BODY_PATH = 'M15 9h12v7l5 5v27a7 7 0 0 1-7 7h-8a7 7 0 0 1-7-7V21l5-5z';
const TANK_INNER_PATH = 'M15 20h12l3 3v25a4 4 0 0 1-4 4h-10a4 4 0 0 1-4-4V23z';

/** Compact N₂O tank gauge; the liquid level and accessible percentage share one state. */
export class BoostGauge {
  readonly #root: HTMLElement;
  readonly #fill: SVGRectElement;
  readonly #status: HTMLElement;
  readonly #percent: HTMLElement;
  #lastPercent = -1;
  #lastActive = false;

  constructor(root: HTMLElement) {
    this.#root = root;
    root.replaceChildren();
    root.classList.add('nitro-gauge');
    root.hidden = false;
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-label', 'N₂O boost tank');
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', '100');

    const tank = document.createElementNS(SVG_NAMESPACE, 'svg');
    tank.setAttribute('class', 'nitro-gauge-tank');
    tank.setAttribute('viewBox', '0 0 42 64');
    tank.setAttribute('aria-hidden', 'true');
    tank.setAttribute('focusable', 'false');

    const definitions = document.createElementNS(SVG_NAMESPACE, 'defs');
    const clip = document.createElementNS(SVG_NAMESPACE, 'clipPath');
    clip.setAttribute('id', 'nitro-gauge-liquid-clip');
    const clipShape = document.createElementNS(SVG_NAMESPACE, 'path');
    clipShape.setAttribute('d', TANK_INNER_PATH);
    clip.append(clipShape);
    definitions.append(clip);

    const track = document.createElementNS(SVG_NAMESPACE, 'path');
    track.setAttribute('class', 'nitro-gauge-track');
    track.setAttribute('d', TANK_INNER_PATH);

    const fill = document.createElementNS(SVG_NAMESPACE, 'rect');
    fill.setAttribute('class', 'nitro-gauge-fill');
    fill.setAttribute('x', '10');
    fill.setAttribute('y', '20');
    fill.setAttribute('width', '22');
    fill.setAttribute('height', '32');
    fill.setAttribute('clip-path', 'url(#nitro-gauge-liquid-clip)');
    this.#fill = fill;

    const shell = document.createElementNS(SVG_NAMESPACE, 'path');
    shell.setAttribute('class', 'nitro-gauge-shell');
    shell.setAttribute('d', TANK_BODY_PATH);
    const cap = document.createElementNS(SVG_NAMESPACE, 'path');
    cap.setAttribute('class', 'nitro-gauge-cap');
    cap.setAttribute('d', 'M14 5h14v5H14z M18 2h6v3h-6z');
    const shine = document.createElementNS(SVG_NAMESPACE, 'path');
    shine.setAttribute('class', 'nitro-gauge-shine');
    shine.setAttribute('d', 'M14 24v22');
    tank.append(definitions, track, fill, shell, cap, shine);

    const copy = document.createElement('div');
    copy.className = 'nitro-gauge-copy';
    const title = document.createElement('strong');
    title.className = 'nitro-gauge-title';
    title.textContent = 'N₂O BOOST';
    this.#status = document.createElement('span');
    this.#status.className = 'nitro-gauge-status';
    this.#percent = document.createElement('span');
    this.#percent.className = 'nitro-gauge-percent';
    copy.append(title, this.#status, this.#percent);
    root.append(tank, copy);
    this.update({ charge: 1, active: false });
  }

  update(state: NitroBoostState): void {
    const charge = clamp(state.charge, 0, 1);
    const percent = Math.round(charge * 100);
    const percentChanged = percent !== this.#lastPercent;
    if (percentChanged) {
      const liquidHeight = 32 * charge;
      this.#fill.setAttribute('y', (52 - liquidHeight).toFixed(2));
      this.#fill.setAttribute('height', liquidHeight.toFixed(2));
      this.#percent.textContent = `${percent}%`;
      this.#root.setAttribute('aria-valuenow', String(percent));
      this.#lastPercent = percent;
    }

    const active = state.active && charge > 0;
    if (active !== this.#lastActive || percentChanged) {
      this.#lastActive = active;
      this.#root.dataset['boostActive'] = String(active);
    }
    const status = active ? 'BOOSTING' : percent === 100 ? 'READY' : 'RECHARGING';
    this.#status.textContent = status;
    this.#root.setAttribute('aria-valuetext', `${percent}% charge, ${status.toLowerCase()}`);
  }

  dispose(): void {
    this.#root.replaceChildren();
    this.#root.hidden = true;
    this.#root.classList.remove('nitro-gauge');
    this.#root.removeAttribute('role');
    this.#root.removeAttribute('aria-label');
    this.#root.removeAttribute('aria-valuemin');
    this.#root.removeAttribute('aria-valuemax');
    this.#root.removeAttribute('aria-valuenow');
    this.#root.removeAttribute('aria-valuetext');
    delete this.#root.dataset['boostActive'];
  }
}
