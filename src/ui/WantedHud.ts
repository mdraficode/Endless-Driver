/**
 * Phase 10 Most Wanted — the on-screen wanted meter (NFS Most Wanted 2005 style): a bar of 15
 * stacked squares that lights one per heat level, the current square fills with the meter, blue →
 * yellow → red as heat escalates, and flashes as the next level nears. A dispatch/toast line below
 * carries the 911 / level-up / "lost sight" / "stood down" radio calls.
 *
 * The display *math* lives in `src/most-wanted/WantedHudModel.ts` (pure + unit-tested). This class
 * is a thin DOM renderer over it, built to mirror `BoostGauge` (owns its DOM, `update`, `dispose`).
 */
import { HEAT_LEVELS } from '../config/most-wanted';
import { TIER_COLOR, computeWantedDisplay } from '../most-wanted/WantedHudModel';
import type { HeatState, RadioMessage } from '../most-wanted/HeatModel';

/** How long a dispatch line stays on screen (ms). */
const TOAST_MS = 3400;

export class WantedHud {
  readonly #root: HTMLElement;
  readonly #level: HTMLElement;
  readonly #bar: HTMLElement;
  readonly #radio: HTMLElement;
  readonly #segments: HTMLElement[] = [];
  #toastDeadline = 0;

  constructor(root: HTMLElement) {
    this.#root = root;
    root.replaceChildren();
    root.classList.add('wanted-hud');
    root.hidden = true;
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-label', 'Police wanted level');
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', String(HEAT_LEVELS));
    root.setAttribute('aria-valuenow', '0');

    const head = document.createElement('div');
    head.className = 'wanted-hud-head';
    const label = document.createElement('span');
    label.className = 'wanted-hud-label';
    label.textContent = 'WANTED';
    this.#level = document.createElement('span');
    this.#level.className = 'wanted-hud-level';
    this.#level.textContent = '0';
    head.append(label, this.#level);

    this.#bar = document.createElement('div');
    this.#bar.className = 'wanted-hud-bar';
    for (let i = 0; i < HEAT_LEVELS; i += 1) {
      const seg = document.createElement('span');
      seg.className = 'wanted-seg';
      const fill = document.createElement('span');
      fill.className = 'wanted-seg-fill';
      seg.append(fill);
      this.#bar.append(seg);
      this.#segments.push(fill);
    }

    this.#radio = document.createElement('p');
    this.#radio.className = 'wanted-hud-radio';
    this.#radio.setAttribute('aria-live', 'polite');

    root.append(head, this.#bar, this.#radio);
  }

  update(state: HeatState, message: RadioMessage | null): void {
    const display = computeWantedDisplay(state);
    const now = typeof performance !== 'undefined' ? performance.now() : 0;

    // Dispatch toast: a fresh message shows for TOAST_MS, then fades.
    if (message !== null) {
      this.#radio.textContent = message.text;
      this.#radio.dataset['shown'] = 'true';
      this.#toastDeadline = now + TOAST_MS;
    } else if (this.#toastDeadline !== 0 && now >= this.#toastDeadline) {
      this.#radio.dataset['shown'] = 'false';
      this.#toastDeadline = 0;
    }

    const toastVisible = this.#toastDeadline !== 0 && now < this.#toastDeadline;
    this.#root.hidden = !(display.active || toastVisible);
    if (this.#root.hidden) return;

    this.#root.dataset['tier'] = display.tier;
    this.#root.dataset['flash'] = display.flash ? 'true' : 'false';
    this.#root.dataset['evading'] = display.evading ? 'true' : 'false';
    this.#root.setAttribute('aria-valuenow', String(display.level));
    this.#root.setAttribute('aria-valuetext', `Heat level ${display.level} of ${HEAT_LEVELS}`);
    this.#level.textContent = String(display.level);

    for (let i = 0; i < this.#segments.length; i += 1) {
      const fill = this.#segments[i];
      if (!fill) continue;
      const width = i < display.filledFull ? 1 : i === display.filledFull ? display.topFraction : 0;
      fill.style.width = `${(width * 100).toFixed(1)}%`;
    }
    // Apply the tier colour to the whole meter.
    this.#root.style.setProperty('--wanted-color', TIER_COLOR[display.tier]);
  }

  dispose(): void {
    this.#root.replaceChildren();
    this.#root.hidden = true;
    this.#root.classList.remove('wanted-hud');
    this.#root.removeAttribute('role');
    this.#root.removeAttribute('aria-label');
    this.#root.removeAttribute('aria-valuemin');
    this.#root.removeAttribute('aria-valuemax');
    this.#root.removeAttribute('aria-valuenow');
    this.#root.removeAttribute('aria-valuetext');
    this.#root.style.removeProperty('--wanted-color');
    delete this.#root.dataset['tier'];
    delete this.#root.dataset['flash'];
    delete this.#root.dataset['evading'];
    this.#segments.length = 0;
  }
}
