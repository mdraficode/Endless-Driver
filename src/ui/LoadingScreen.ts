export interface LoadingProgress {
  readonly progress: number;
  readonly label: string;
}

const VISUAL_CREEP_PER_SECOND = 0.012;
const ACTUAL_PROGRESS_FOLLOW_MS = 240;
const MAX_FRAME_DELTA_MS = 100;

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
  #displayFraction = 0;
  #lastFrameTimestamp: number | null = null;
  #progressFrame: number | null = null;
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
    this.#stopProgressAnimation();
    if (this.#hideTimer !== null) {
      window.clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
    this.#finished = false;
    this.#fraction = 0;
    this.#displayFraction = 0;
    this.#root.hidden = false;
    this.#root.setAttribute('aria-hidden', 'false');
    this.#root.dataset['state'] = 'loading';
    this.#root.classList.remove('loading-screen-complete');
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
      this.#stopProgressAnimation();
      this.#displayFraction = 1;
      delete this.#root.dataset['progressPhase'];
      this.#progress.removeAttribute?.('aria-valuetext');
      this.#bar.style.width = '100%';
      this.#percent.textContent = '100%';
      this.#label.textContent = label;
      this.#finish();
      return;
    }

    const prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (prefersReducedMotion) {
      this.#stopProgressAnimation();
      this.#displayFraction = this.#fraction >= 0.94 ? 1 : this.#fraction;
      this.#root.dataset['progressPhase'] = this.#displayFraction >= 1 ? 'waiting' : 'static';
      this.#bar.style.width = `${Math.round(this.#displayFraction * 100)}%`;
      this.#percent.textContent = this.#displayFraction >= 1 ? 'Still working…' : `${percent}%`;
      this.#label.textContent =
        this.#fraction >= 0.94 ? 'Finishing the first playable frame…' : label;
      this.#progress.setAttribute(
        'aria-valuetext',
        this.#displayFraction >= 1
          ? 'The bar is full; startup is still in progress.'
          : 'Startup is in progress.',
      );
      return;
    }

    this.#label.textContent =
      this.#fraction >= 0.94 ? 'Finishing the first playable frame…' : label;
    this.#progress.setAttribute(
      'aria-valuetext',
      'The displayed progress is an estimate; startup is still in progress.',
    );
    this.#paintProgress();
    this.#scheduleProgressFrame();
  }

  /** The overlay only completes after the renderer has submitted its first playable frame. */
  complete(): void {
    if (this.#finished) {
      return;
    }
    this.update(1, 'Ready — the drive starts automatically');
  }

  #advanceProgress = (timestamp: number): void => {
    this.#progressFrame = null;
    if (this.#finished) {
      return;
    }

    const elapsedMs =
      this.#lastFrameTimestamp === null
        ? 0
        : Math.min(MAX_FRAME_DELTA_MS, Math.max(0, timestamp - this.#lastFrameTimestamp));
    this.#lastFrameTimestamp = timestamp;

    const follow = 1 - Math.exp(-elapsedMs / ACTUAL_PROGRESS_FOLLOW_MS);
    const catchingUp = this.#displayFraction + (this.#fraction - this.#displayFraction) * follow;
    const creeping = this.#displayFraction + (elapsedMs / 1000) * VISUAL_CREEP_PER_SECOND;
    this.#displayFraction = Math.min(1, Math.max(this.#displayFraction, catchingUp, creeping));
    this.#paintProgress();
    this.#scheduleProgressFrame();
  };

  #paintProgress(): void {
    if (this.#displayFraction >= 1) {
      this.#root.dataset['progressPhase'] = 'waiting';
      this.#bar.style.width = '100%';
      this.#percent.textContent = 'Still working…';
      this.#label.textContent =
        this.#fraction >= 0.94
          ? 'Finishing the first playable frame…'
          : 'Still preparing the starting scene…';
      this.#progress.setAttribute(
        'aria-valuetext',
        'The visual bar is full; actual startup is still in progress.',
      );
      return;
    }

    this.#root.dataset['progressPhase'] =
      this.#fraction >= 0.94 || this.#displayFraction >= 0.94 ? 'finalizing' : 'animating';
    this.#bar.style.width = `${(this.#displayFraction * 100).toFixed(2)}%`;
    const estimatedPercent = Math.min(99, Math.floor(this.#displayFraction * 100));
    this.#percent.textContent = `~${estimatedPercent}%`;
    if (this.#fraction >= 0.94) {
      this.#label.textContent = 'Finishing the first playable frame…';
    }
  }

  #scheduleProgressFrame(): void {
    if (!this.#finished && this.#displayFraction < 1 && this.#progressFrame === null) {
      this.#progressFrame = window.requestAnimationFrame(this.#advanceProgress);
    }
  }

  #stopProgressAnimation(): void {
    if (this.#progressFrame !== null) {
      window.cancelAnimationFrame(this.#progressFrame);
      this.#progressFrame = null;
    }
    this.#lastFrameTimestamp = null;
  }

  #finish(): void {
    if (this.#finished) {
      return;
    }
    this.#finished = true;
    delete this.#root.dataset['progressPhase'];
    this.#root.dataset['state'] = 'ready';
    this.#root.classList.add('loading-screen-complete');
    this.#hideTimer = window.setTimeout(() => this.hide(), 520);
  }

  fail(message: string): void {
    this.#finished = true;
    this.#stopProgressAnimation();
    if (this.#hideTimer !== null) {
      window.clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
    delete this.#root.dataset['progressPhase'];
    this.#progress.removeAttribute?.('aria-valuetext');
    this.#displayFraction = this.#fraction;
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
    this.#stopProgressAnimation();
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
