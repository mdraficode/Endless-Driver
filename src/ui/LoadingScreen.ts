export interface LoadingProgress {
  readonly progress: number;
  readonly label: string;
}

/**
 * Fraction rates: a minimum crawl during stalls, with bounded catch-up toward reported progress.
 */
const MIN_VISUAL_PROGRESS_PER_SECOND = 0.06;
const MAX_VISUAL_PROGRESS_PER_SECOND = 0.08;
const PROGRESS_FOLLOW_GAIN = 0.5;
const FIRST_FRAME_COMPLETION_RATE_PER_SECOND = 0.12;
const PRE_READY_PROGRESS_CAP = 0.99;
const PROGRESS_TICK_INTERVAL_MS = 50;
const PROGRESS_INTEGRATION_STEP_SECONDS = 0.1;
const MAX_PROGRESS_CATCH_UP_SECONDS = 60;

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
  readonly #onHidden: (() => void) | null;
  #fraction = 0;
  #displayFraction = 0;
  #lastProgressTimestamp: number | null = null;
  #progressTimer: number | null = null;
  #completionPending = false;
  #completionLabel = 'Ready — the drive starts automatically';
  #finished = false;
  #hideTimer: number | null = null;

  constructor(root: HTMLElement, onHidden?: () => void) {
    this.#root = root;
    this.#onHidden = onHidden ?? null;
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
    this.#completionPending = false;
    this.#completionLabel = 'Ready — the drive starts automatically';
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
    if (this.#finished || this.#completionPending) {
      return;
    }
    this.#fraction = normalizeLoadingProgress(progress, this.#fraction);
    const percent = Math.round(this.#fraction * 100);
    this.#progress.setAttribute('aria-valuenow', String(percent));

    if (this.#fraction >= 1) {
      this.#stopProgressAnimation();
      this.#completionPending = true;
      this.#completionLabel = label;
      this.#progress.setAttribute(
        'aria-valuetext',
        'The first playable frame has rendered; the loading bar is finishing before the screen fades.',
      );

      if (this.#displayFraction >= 1) {
        this.#completeVisibleReadyState();
        return;
      }

      this.#root.dataset['progressPhase'] = 'finalizing';
      this.#label.textContent = 'First playable frame ready — finishing up…';
      this.#percent.textContent = `${Math.max(0, Math.min(99, Math.floor(this.#displayFraction * 100)))}%`;
      this.#scheduleProgressTimer();
      return;
    }

    // Keep the progress movement itself gradual even for reduced-motion users; CSS suppresses
    // decorative sheen and transitions for that preference without snapping to a reported stage.
    this.#label.textContent =
      this.#fraction >= 0.94 ? 'Finishing the first playable frame…' : label;
    this.#progress.setAttribute(
      'aria-valuetext',
      'The displayed progress is an estimate; startup is still in progress.',
    );
    this.#paintProgress();
    this.#scheduleProgressTimer();
  }

  /** The overlay only completes after the renderer has submitted its first playable frame. */
  complete(): void {
    if (this.#finished) {
      return;
    }
    this.update(1, 'Ready — the drive starts automatically');
  }

  #advanceProgress = (): void => {
    if (this.#finished) {
      this.#stopProgressAnimation();
      return;
    }

    const timestamp = window.performance.now();
    const elapsedMs =
      this.#lastProgressTimestamp === null
        ? 0
        : Math.max(0, timestamp - this.#lastProgressTimestamp);
    this.#lastProgressTimestamp = timestamp;

    if (this.#completionPending) {
      const elapsedSeconds = Math.min(MAX_PROGRESS_CATCH_UP_SECONDS, elapsedMs / 1000);
      this.#displayFraction = Math.min(
        1,
        this.#displayFraction + FIRST_FRAME_COMPLETION_RATE_PER_SECOND * elapsedSeconds,
      );
      if (this.#displayFraction >= 1) {
        this.#completeVisibleReadyState();
        return;
      }
      this.#paintCompletionProgress();
      this.#scheduleProgressTimer();
      return;
    }

    this.#advanceEstimatedProgress(elapsedMs / 1000);
    this.#paintProgress();
    if (this.#displayFraction >= PRE_READY_PROGRESS_CAP) {
      this.#stopProgressAnimation();
      return;
    }
    this.#scheduleProgressTimer();
  };

  #advanceEstimatedProgress(elapsedSeconds: number): void {
    let remainingSeconds = Math.min(MAX_PROGRESS_CATCH_UP_SECONDS, Math.max(0, elapsedSeconds));
    while (remainingSeconds > 0 && this.#displayFraction < 1) {
      const stepSeconds = Math.min(PROGRESS_INTEGRATION_STEP_SECONDS, remainingSeconds);
      const gapToReportedProgress = Math.max(0, this.#fraction - this.#displayFraction);
      const visualRate = Math.min(
        MAX_VISUAL_PROGRESS_PER_SECOND,
        MIN_VISUAL_PROGRESS_PER_SECOND + gapToReportedProgress * PROGRESS_FOLLOW_GAIN,
      );
      this.#displayFraction = Math.min(
        PRE_READY_PROGRESS_CAP,
        this.#displayFraction + visualRate * stepSeconds,
      );
      remainingSeconds -= stepSeconds;
    }
  }

  /**
   * Sets the fill width and mirrors it into `--loading-fill-width` on the root, which the glow
   * layer (the track's `::after`) uses for its own width. The two must always move together, so
   * every width change goes through here.
   */
  #setBarWidth(width: string): void {
    this.#bar.style.width = width;
    this.#root.style.setProperty('--loading-fill-width', width);
  }

  #paintProgress(): void {
    if (this.#displayFraction >= PRE_READY_PROGRESS_CAP) {
      this.#root.dataset['progressPhase'] = 'waiting';
      this.#setBarWidth('99%');
      this.#percent.textContent = '99%';
      this.#label.textContent = 'Still working…';
      this.#progress.setAttribute(
        'aria-valuetext',
        'The visual bar is held at 99% until the first playable frame is ready.',
      );
      return;
    }

    this.#root.dataset['progressPhase'] =
      this.#fraction >= 0.94 || this.#displayFraction >= 0.94 ? 'finalizing' : 'animating';
    this.#setBarWidth(`${(this.#displayFraction * 100).toFixed(2)}%`);
    const visiblePercent = Math.max(0, Math.min(99, Math.floor(this.#displayFraction * 100)));
    this.#percent.textContent = `${visiblePercent}%`;
    if (this.#fraction >= 0.94) {
      this.#label.textContent = 'Finishing the first playable frame…';
    }
  }

  #paintCompletionProgress(): void {
    this.#root.dataset['progressPhase'] = 'finalizing';
    this.#setBarWidth(`${(this.#displayFraction * 100).toFixed(2)}%`);
    const visiblePercent = Math.max(0, Math.min(99, Math.floor(this.#displayFraction * 100)));
    this.#percent.textContent = `${visiblePercent}%`;
    this.#label.textContent = 'First playable frame ready — finishing up…';
    this.#progress.setAttribute(
      'aria-valuetext',
      'The first playable frame is ready; completing the progress display before showing the game.',
    );
  }

  #completeVisibleReadyState(): void {
    this.#completionPending = false;
    this.#displayFraction = 1;
    delete this.#root.dataset['progressPhase'];
    this.#progress.removeAttribute?.('aria-valuetext');
    this.#progress.setAttribute('aria-valuenow', '100');
    this.#setBarWidth('100%');
    this.#percent.textContent = '100%';
    this.#label.textContent = this.#completionLabel;
    this.#finish();
  }

  #scheduleProgressTimer(): void {
    if (
      !this.#finished &&
      (this.#completionPending || this.#displayFraction < PRE_READY_PROGRESS_CAP) &&
      this.#progressTimer === null
    ) {
      this.#lastProgressTimestamp = window.performance.now();
      this.#progressTimer = window.setInterval(this.#advanceProgress, PROGRESS_TICK_INTERVAL_MS);
    }
  }

  #stopProgressAnimation(): void {
    if (this.#progressTimer !== null) {
      window.clearInterval(this.#progressTimer);
      this.#progressTimer = null;
    }
    this.#lastProgressTimestamp = null;
  }

  #finish(): void {
    if (this.#finished) {
      return;
    }
    this.#stopProgressAnimation();
    this.#finished = true;
    this.#completionPending = false;
    this.#root.dataset['progressPhase'] = 'complete';
    this.#root.dataset['state'] = 'ready';
    this.#root.classList.add('loading-screen-complete');
    this.#hideTimer = window.setTimeout(() => this.hide(), 520);
  }

  fail(message: string): void {
    this.#finished = true;
    this.#completionPending = false;
    this.#stopProgressAnimation();
    if (this.#hideTimer !== null) {
      window.clearTimeout(this.#hideTimer);
      this.#hideTimer = null;
    }
    // A failure reported after the overlay was hidden would otherwise be invisible; make the
    // error state visible no matter which way the race went.
    this.#root.hidden = false;
    this.#root.setAttribute('aria-hidden', 'false');
    this.#root.dataset['state'] = 'error';
    delete this.#root.dataset['progressPhase'];
    this.#progress.removeAttribute?.('aria-valuetext');
    this.#displayFraction = this.#fraction;
    const percent = Math.round(this.#fraction * 100);
    this.#setBarWidth(`${percent}%`);
    this.#progress.setAttribute('aria-valuenow', String(percent));
    this.#percent.textContent = `${percent}%`;
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
    this.#onHidden?.();
  }
}

function requireElement<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Loading screen is missing ${selector}`);
  }
  return element;
}
