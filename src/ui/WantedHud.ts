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
import type { PursuitHudData } from '../most-wanted/types';

/** How long a dispatch line stays on screen (ms). */
const TOAST_MS = 3400;

export class WantedHud {
  readonly #root: HTMLElement;
  readonly #level: HTMLElement;
  readonly #bar: HTMLElement;
  readonly #radio: HTMLElement;
  readonly #pursuit: HTMLElement;
  readonly #pursuitStatus: HTMLElement;
  readonly #pursuitBustFill: HTMLElement;
  readonly #pursuitCount: HTMLElement;
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

    // Pursuit bar (Milestone 3b): status + bust meter + squad size, shown during a chase.
    this.#pursuit = document.createElement('div');
    this.#pursuit.className = 'wanted-hud-pursuit';
    this.#pursuit.hidden = true;
    this.#pursuitStatus = document.createElement('span');
    this.#pursuitStatus.className = 'pursuit-status';
    this.#pursuitBustFill = document.createElement('span');
    this.#pursuitBustFill.className = 'pursuit-bust-fill';
    this.#pursuitCount = document.createElement('span');
    this.#pursuitCount.className = 'pursuit-count';
    const pursuitBust = document.createElement('span');
    pursuitBust.className = 'pursuit-bust';
    pursuitBust.append(this.#pursuitBustFill);
    this.#pursuit.append(this.#pursuitStatus, pursuitBust, this.#pursuitCount);

    this.#radio = document.createElement('p');
    this.#radio.className = 'wanted-hud-radio';
    this.#radio.setAttribute('aria-live', 'polite');

    root.append(head, this.#bar, this.#pursuit, this.#radio);
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

  /** Milestone 3b: render the pursuit bar (status + bust meter + squad size) for a live chase. */
  updatePursuit(data: PursuitHudData): void {
    const active = data.phase !== 'inactive' && data.level > 0;
    this.#pursuit.hidden = !active;
    if (!active) return;
    this.#pursuit.dataset['state'] = data.busted
      ? 'busted'
      : data.phase === 'cooldown'
        ? 'evading'
        : 'pursuit';
    this.#pursuitStatus.textContent = data.busted
      ? 'BUSTED'
      : data.phase === 'cooldown'
        ? 'EVADING'
        : 'PURSUIT';
    this.#pursuitBustFill.style.width = `${Math.round(Math.max(0, Math.min(1, data.bustMeter)) * 100)}%`;
    this.#pursuitCount.textContent = `×${data.activeUnits}`;
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
