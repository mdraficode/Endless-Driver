export interface LandscapeLayout {
  readonly rotate: boolean;
  /** Logical landscape width before the page-level quarter-turn. */
  readonly width: number;
  /** Logical landscape height before the page-level quarter-turn. */
  readonly height: number;
}

/** Pure sizing rule for the in-page landscape fallback; it never claims to change OS rotation. */
export function resolveLandscapeLayout(
  viewportWidth: number,
  viewportHeight: number,
  isTouchDevice: boolean,
): LandscapeLayout {
  const width = Number.isFinite(viewportWidth) ? Math.max(1, Math.floor(viewportWidth)) : 1;
  const height = Number.isFinite(viewportHeight) ? Math.max(1, Math.floor(viewportHeight)) : 1;
  const rotate = isTouchDevice && height > width;
  return rotate ? { rotate, width: height, height: width } : { rotate, width, height };
}

/** Rotates the whole game surface in portrait when the browser cannot lock orientation natively. */
export class LandscapeFallback {
  readonly #root: HTMLElement;
  readonly #isTouchDevice: boolean;
  readonly #handleChange = (): void => this.update();
  #disposed = false;

  constructor(root: HTMLElement, forceTouch = false) {
    this.#root = root;
    this.#isTouchDevice =
      forceTouch ||
      window.matchMedia?.('(pointer: coarse)').matches === true ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints ?? 0) > 0;
    window.addEventListener('resize', this.#handleChange, { passive: true });
    window.visualViewport?.addEventListener('resize', this.#handleChange, { passive: true });
    screen.orientation?.addEventListener?.('change', this.#handleChange);
    this.update();
  }

  update(): void {
    if (this.#disposed) {
      return;
    }
    const layout = resolveLandscapeLayout(
      window.innerWidth,
      window.innerHeight,
      this.#isTouchDevice,
    );
    this.#root.classList.toggle('landscape-fallback', layout.rotate);
    if (layout.rotate) {
      this.#root.style.setProperty('--landscape-width', `${layout.width}px`);
      this.#root.style.setProperty('--landscape-height', `${layout.height}px`);
    } else {
      this.#root.style.removeProperty('--landscape-width');
      this.#root.style.removeProperty('--landscape-height');
    }
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    window.removeEventListener('resize', this.#handleChange);
    window.visualViewport?.removeEventListener('resize', this.#handleChange);
    screen.orientation?.removeEventListener?.('change', this.#handleChange);
    this.#root.classList.remove('landscape-fallback');
    this.#root.style.removeProperty('--landscape-width');
    this.#root.style.removeProperty('--landscape-height');
  }
}
