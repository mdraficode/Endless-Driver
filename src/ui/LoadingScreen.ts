export interface LoadingProgress {
  readonly progress: number;
  readonly label: string;
}

/** Clamp reported startup progress and keep its completed-work fraction monotonic. */
export function normalizeLoadingProgress(progress: number, previous = 0): number {
  if (!Number.isFinite(progress)) {
    return Math.min(1, Math.max(0, previous));
  }
  return Math.min(1, Math.max(Math.min(1, Math.max(0, previous)), Math.max(0, progress)));
}

/** Branded loading surface; gameplay is started automatically once the first frame is rendered. */
export class LoadingScreen {
  readonly #root: HTMLElement;
  readonly #bar: HTMLElement;
  readonly #progress: HTMLElement;
  readonly #label: HTMLElement;
  readonly #percent: HTMLElement;
  readonly #retryButton: HTMLButtonElement | null;
  #fraction = 0;
  #finished = false;
  #hideTimer: number | null = null;

  constructor(root: HTMLElement) {
    this.#root = root;
    this.#bar = requireElement(root, '#loading-progress-fill');
    this.#progress = requireElement(root, '#loading-progress');
    this.#label = requireElement(root, '#loading-stage-label');
    this.#percent = requireElement(root, '#loading-percent');
    this.#retryButton = root.querySelector<HTMLButtonElement>('#loading-retry');
    this.#retryButton?.addEventListener('click', () => window.location.reload());
  }

  show(label = 'Starting the Aohara drive…'): void {
    if (this.#hideTimer !== null) {
      window.clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
    this.#finished = false;
    this.#fraction = 0;
    this.#root.hidden = false;
    this.#root.setAttribute('aria-hidden', 'false');
    this.#root.dataset['state'] = 'loading';
    if (this.#retryButton !== null) {
      this.#retryButton.hidden = true;
    }
    this.update(0, label);
  }

  update(progress: number, label: string): void {
    if (this.#finished) {
      return;
    }
    this.#fraction = normalizeLoadingProgress(progress, this.#fraction);
    const percent = Math.round(this.#fraction * 100);
    this.#progress.setAttribute('aria-valuenow', String(percent));

    if (this.#fraction >= 1) {
      delete this.#root.dataset['progressPhase'];
      this.#progress.removeAttribute?.('aria-valuetext');
      this.#bar.style.width = '100%';
      this.#percent.textContent = '100%';
      this.#label.textContent = label;
      this.#finish();
      return;
    }

    if (this.#fraction >= 0.94) {
      // The remaining work ends at the first rendered frame, which can take a variable amount of
      // time. Show an explicitly approximate crawl rather than leaving a misleading fixed 94%.
      this.#root.dataset['progressPhase'] = 'finalizing';
      this.#bar.style.width = '99%';
      this.#progress.setAttribute('aria-valuetext', 'Finishing the first playable frame');
      this.#percent.textContent = 'Almost ready…';
      this.#label.textContent = 'Finishing the first playable frame…';
      return;
    }

    delete this.#root.dataset['progressPhase'];
    this.#progress.removeAttribute?.('aria-valuetext');
    this.#bar.style.width = `${percent}%`;
    this.#percent.textContent = `${percent}%`;
    this.#label.textContent = label;
  }

  /** The overlay only completes after the renderer has submitted its first playable frame. */
  complete(): void {
    if (this.#finished) {
      return;
    }
    this.update(1, 'Ready — the drive starts automatically');
  }

  #finish(): void {
    if (this.#finished) {
      return;
    }
    this.#finished = true;
    this.#root.dataset['state'] = 'ready';
    this.#root.classList.add('loading-screen-complete');
    this.#hideTimer = window.setTimeout(() => this.hide(), 520);
  }

  fail(message: string): void {
    this.#finished = true;
    if (this.#hideTimer !== null) {
      window.clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
    delete this.#root.dataset['progressPhase'];
    this.#progress.removeAttribute?.('aria-valuetext');
    const percent = Math.round(this.#fraction * 100);
    this.#bar.style.width = `${percent}%`;
    this.#progress.setAttribute('aria-valuenow', String(percent));
    this.#percent.textContent = `${percent}%`;
    this.#root.dataset['state'] = 'error';
    this.#label.textContent = `Could not start: ${message}`;
    this.#root.classList.remove('loading-screen-complete');
    if (this.#retryButton !== null) {
      this.#retryButton.hidden = false;
    }
  }

  hide(): void {
    if (this.#hideTimer !== null) {
      window.clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
    delete this.#root.dataset['progressPhase'];
    this.#root.hidden = true;
    this.#root.setAttribute('aria-hidden', 'true');
    this.#root.classList.remove('loading-screen-complete');
  }
}

function requireElement<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Loading screen is missing ${selector}`);
  }
  return element;
}
