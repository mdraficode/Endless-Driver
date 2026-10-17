export interface OrbitGestureOptions {
  /** Called with each swipe movement in pixels while a free-space drag is live. */
  readonly onSwipe: (deltaXPixels: number, deltaYPixels: number) => void;
}

/**
 * Free-space swipe gesture that orbits the chase camera (owner request 2026-10-17).
 *
 * The surface is the canvas itself: every on-screen control (joystick, pedals,
 * utility buttons, diagnostics, studio panel) is a separate element that captures
 * its own pointers, so a pointer that goes down on the canvas is by definition a
 * thumb or mouse in empty screen. One pointer orbits at a time; a second thumb on
 * the joystick keeps driving while the first swipes, because the joystick holds its
 * own pointer capture.
 *
 * Pointer events cover touch and mouse with one code path: a mouse drag on desktop
 * orbits exactly like a swipe, which is the same gesture on a different device.
 */
export class OrbitGesture {
  readonly #surface: HTMLElement;

  readonly #options: OrbitGestureOptions;

  #pointerId: number | null = null;

  #lastX = 0;

  #lastY = 0;

  constructor(surface: HTMLElement, options: OrbitGestureOptions) {
    this.#surface = surface;
    this.#options = options;
    surface.addEventListener('pointerdown', this.#onDown);
    surface.addEventListener('pointermove', this.#onMove);
    surface.addEventListener('pointerup', this.#onUp);
    surface.addEventListener('pointercancel', this.#onUp);
  }

  /** True while a free-space drag is orbiting the camera. */
  get active(): boolean {
    return this.#pointerId !== null;
  }

  dispose(): void {
    this.#surface.removeEventListener('pointerdown', this.#onDown);
    this.#surface.removeEventListener('pointermove', this.#onMove);
    this.#surface.removeEventListener('pointerup', this.#onUp);
    this.#surface.removeEventListener('pointercancel', this.#onUp);
    this.#pointerId = null;
  }

  readonly #onDown = (event: PointerEvent): void => {
    // Only the canvas is free space; a pointer that started on any control never
    // reaches here because controls capture it, but a re-targeted event must not
    // start a second orbit either.
    if (event.target !== this.#surface) {
      return;
    }
    if (this.#pointerId !== null) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    this.#pointerId = event.pointerId;
    this.#lastX = event.clientX;
    this.#lastY = event.clientY;
    this.#surface.setPointerCapture?.(event.pointerId);
  };

  readonly #onMove = (event: PointerEvent): void => {
    if (this.#pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - this.#lastX;
    const dy = event.clientY - this.#lastY;
    this.#lastX = event.clientX;
    this.#lastY = event.clientY;
    if (dx !== 0 || dy !== 0) {
      this.#options.onSwipe(dx, dy);
    }
  };

  readonly #onUp = (event: PointerEvent): void => {
    if (this.#pointerId !== event.pointerId) {
      return;
    }
    this.#pointerId = null;
    this.#surface.releasePointerCapture?.(event.pointerId);
  };
}
