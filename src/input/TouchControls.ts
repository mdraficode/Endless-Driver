import { TOUCH_CONTROL_CONFIG } from '../config/input';
import {
  TOUCH_CONTROL_SCALE_MAX_PERCENT,
  TOUCH_CONTROL_SCALE_MIN_PERCENT,
  TOUCH_CONTROL_SCALE_STEP_PERCENT,
} from '../config/game-preferences';
import type { TouchSteeringMode } from '../config/game-preferences';
import { requestFullscreenBestEffort } from '../ui/FullscreenOnStart';
import { SteeringWheelGesture, TouchStateTracker, type TouchDriveState } from './touch-state';

export type TouchCommand = 'reset' | 'toggleCamera' | 'toggleDiagnostics';

export interface TouchControlsOptions {
  /** Called with the aggregated driving state whenever any thumb moves. */
  readonly onState: (state: TouchDriveState) => void;
  /** Called when an on-screen utility button is tapped. */
  readonly onCommand: (command: TouchCommand) => void;
  /**
   * Show regardless of pointer detection (captures, kiosk, explicit `?touch=1`).
   * Normally the surface only appears on coarse-pointer/touch devices.
   */
  readonly force?: boolean;
  /** Live-selectable left-side steering control. */
  readonly steeringMode?: TouchSteeringMode;
  /** Percentage scale applied to the on-screen controls (70–140%). */
  readonly controlScalePercent?: number;
}

interface SteeringWheelPointer {
  readonly id: number;
  readonly gesture: SteeringWheelGesture;
}

/**
 * The on-screen driving surface for phones and tablets.
 *
 * Layout is landscape-first: a selectable one-finger rotary wheel or left/right steering buttons
 * under the left thumb, BRAKE/GAS pedals, handbrake and N₂O boost under the right, and small
 * diagnostics/camera/reset/fullscreen buttons top-right. Each control tracks pointer ids so the
 * player can steer, accelerate and boost simultaneously. State funnels through `TouchStateTracker`
 * into the same `InputManager` seam as keyboard/gamepad input.
 *
 * Visibility: rendered only when the device reports a coarse pointer (or `force`).
 * Portrait layout is handled by the in-page landscape fallback. Fullscreen is attempted
 * at session start and silently retried on an activation-capable input event; native
 * orientation lock is best-effort on the first portrait pointerup while fullscreen or from
 * the ⛶ button.
 */
export class TouchControls {
  readonly #root: HTMLElement;

  readonly #tracker = new TouchStateTracker();

  readonly #options: TouchControlsOptions;

  #steeringPointer: SteeringWheelPointer | null = null;

  readonly #arrowPointers = new Map<number, HTMLButtonElement>();

  #steeringMode: TouchSteeringMode;

  #controlScalePercent: number;

  #orientationAttempted = false;

  #disposed = false;

  readonly #windowListeners: (() => void)[] = [];

  constructor(root: HTMLElement, options: TouchControlsOptions) {
    this.#root = root;
    this.#options = options;
    this.#steeringMode = options.steeringMode ?? 'wheel';
    this.#controlScalePercent = TouchControls.#normalizeControlScale(
      options.controlScalePercent ?? 100,
    );
    if (!options.force && !TouchControls.#deviceWantsTouch()) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.classList.add('touch-controls');
    document.body.classList.add('touch-enabled');
    this.#build();
    this.#applyPreferences();
  }

  setPreferences(steeringMode: TouchSteeringMode, controlScalePercent: number): void {
    const modeChanged = this.#steeringMode !== steeringMode;
    this.#steeringMode = steeringMode;
    this.#controlScalePercent = TouchControls.#normalizeControlScale(controlScalePercent);
    if (modeChanged) this.#releaseSteeringControls();
    this.#applyPreferences();
  }

  static #normalizeControlScale(value: number): number {
    if (!Number.isFinite(value)) return 100;
    const snapped =
      Math.round(value / TOUCH_CONTROL_SCALE_STEP_PERCENT) * TOUCH_CONTROL_SCALE_STEP_PERCENT;
    return Math.max(
      TOUCH_CONTROL_SCALE_MIN_PERCENT,
      Math.min(TOUCH_CONTROL_SCALE_MAX_PERCENT, snapped),
    );
  }

  #applyPreferences(): void {
    this.#root.dataset['steeringMode'] = this.#steeringMode;
    this.#root.style.setProperty('--touch-control-scale', String(this.#controlScalePercent / 100));
    const wheel = this.#root.querySelector<HTMLButtonElement>('.touch-steering-wheel');
    const arrows = this.#root.querySelector<HTMLElement>('.touch-steering-arrows');
    if (wheel !== null) wheel.hidden = this.#steeringMode !== 'wheel';
    if (arrows !== null) arrows.hidden = this.#steeringMode !== 'arrows';
  }

  #releaseSteeringControls(): void {
    const wheelPointer = this.#steeringPointer;
    this.#steeringPointer = null;
    if (wheelPointer !== null) {
      this.#tracker.releaseSteering(wheelPointer.id);
      const wheel = this.#root.querySelector<HTMLButtonElement>('.touch-steering-wheel');
      if (wheel?.hasPointerCapture(wheelPointer.id)) wheel.releasePointerCapture(wheelPointer.id);
    }
    const arrowPointers = [...this.#arrowPointers.entries()];
    this.#arrowPointers.clear();
    for (const [pointerId, button] of arrowPointers) {
      this.#tracker.releaseSteering(pointerId);
      button.classList.remove('is-active');
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    }
    this.#root.querySelector('.touch-steering-wheel')?.classList.remove('is-active');
    const artwork = this.#root.querySelector<SVGSVGElement>('.touch-steering-wheel-svg');
    if (artwork !== null) artwork.style.transform = 'rotate(0deg)';
    this.#emit();
  }

  static #deviceWantsTouch(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    const navigatorWithMobileHint = navigator as Navigator & {
      userAgentData?: { readonly mobile?: boolean };
    };
    return (
      window.matchMedia?.('(pointer: coarse)').matches === true ||
      window.matchMedia?.('(any-pointer: coarse)').matches === true ||
      navigatorWithMobileHint.userAgentData?.mobile === true ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      'ontouchstart' in window ||
      (navigator.maxTouchPoints ?? 0) > 0
    );
  }

  /**
   * Best-effort fullscreen/orientation lock. Must be called from a user gesture;
   * unsupported or OS-locked devices keep using the in-page landscape fallback.
   */
  static async requestLandscape(event?: Event): Promise<void> {
    // The fullscreen helper attempts the native landscape lock as soon as entry succeeds.
    await requestFullscreenBestEffort(document, event);
  }

  dispose(): void {
    this.#disposed = true;
    for (const remove of this.#windowListeners) {
      remove();
    }
    this.#windowListeners.length = 0;
    this.#tracker.releaseAll();
    this.#arrowPointers.clear();
    this.#emit();
    this.#root.replaceChildren();
    this.#root.style.removeProperty('--touch-control-scale');
    delete this.#root.dataset['steeringMode'];
    this.#root.classList.remove('touch-controls');
    document.body.classList.remove('touch-enabled');
  }

  #emit(): void {
    if (!this.#disposed) {
      this.#options.onState(this.#tracker.snapshot());
    }
  }

  #build(): void {
    const make = (className: string, label: string, ariaLabel: string): HTMLButtonElement => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = className;
      element.textContent = label;
      element.setAttribute('aria-label', ariaLabel);
      element.addEventListener('contextmenu', (event) => event.preventDefault());
      return element;
    };

    // --- Rotary steering wheel (left thumb) ---
    const steeringWheel = make(
      'touch-steering-wheel',
      '',
      'Steering wheel. Rotate clockwise on the rim to steer right; rotate counterclockwise to steer left. You can also drag left or right from the centre hub.',
    );
    steeringWheel.title = 'Turn the rim with one finger, or drag sideways from the centre hub.';
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const wheelArtwork = document.createElementNS(svgNamespace, 'svg');
    wheelArtwork.setAttribute('class', 'touch-steering-wheel-svg');
    wheelArtwork.setAttribute('viewBox', '0 0 128 128');
    wheelArtwork.setAttribute('aria-hidden', 'true');
    wheelArtwork.setAttribute('focusable', 'false');

    const wheelCircle = (className: string, radius: number): SVGCircleElement => {
      const circle = document.createElementNS(svgNamespace, 'circle');
      circle.setAttribute('class', className);
      circle.setAttribute('cx', '64');
      circle.setAttribute('cy', '64');
      circle.setAttribute('r', String(radius));
      return circle;
    };
    const wheelSpokes = document.createElementNS(svgNamespace, 'path');
    wheelSpokes.setAttribute('class', 'touch-steering-wheel-spokes');
    wheelSpokes.setAttribute('d', 'M64 63 L64 12 M59 68 L21 91 M69 68 L107 91');
    wheelArtwork.append(
      wheelCircle('touch-steering-wheel-rim-shadow', 53),
      wheelCircle('touch-steering-wheel-rim', 53),
      wheelSpokes,
      wheelCircle('touch-steering-wheel-hub', 14),
      wheelCircle('touch-steering-wheel-hub-mark', 5),
    );

    const resetWheelArtwork = (): void => {
      wheelArtwork.style.transform = 'rotate(0deg)';
    };
    const updateWheel = (event: PointerEvent): void => {
      const pointer = this.#steeringPointer;
      if (pointer === null || pointer.id !== event.pointerId) {
        return;
      }
      const steer = pointer.gesture.update(event.clientX, event.clientY);
      this.#tracker.setSteering(event.pointerId, steer);
      const angleDegrees = (pointer.gesture.visualRotationRad * 180) / Math.PI;
      wheelArtwork.style.transform = `rotate(${angleDegrees.toFixed(1)}deg)`;
      this.#emit();
    };
    steeringWheel.append(wheelArtwork);
    steeringWheel.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (this.#steeringPointer !== null) {
        return;
      }
      const rect = steeringWheel.getBoundingClientRect();
      const diameterPx = Math.max(1, Math.min(rect.width, rect.height));
      this.#steeringPointer = {
        id: event.pointerId,
        gesture: new SteeringWheelGesture({
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
          startX: event.clientX,
          startY: event.clientY,
          hubRadiusPx: diameterPx * TOUCH_CONTROL_CONFIG.steeringWheelHubRadiusRatio,
          dragTravelPx: diameterPx * TOUCH_CONTROL_CONFIG.steeringWheelDragTravelRatio,
          maxRotationRad: TOUCH_CONTROL_CONFIG.steeringWheelMaxRotationRad,
          deadzone: TOUCH_CONTROL_CONFIG.steeringWheelDeadzone,
        }),
      };
      steeringWheel.setPointerCapture?.(event.pointerId);
      steeringWheel.classList.add('is-active');
      updateWheel(event);
    });
    steeringWheel.addEventListener('pointermove', updateWheel);
    const releaseWheel = (event: PointerEvent): void => {
      if (this.#steeringPointer?.id !== event.pointerId) {
        return;
      }
      if (event.type === 'pointerup') {
        this.#maybeLockLandscape(event);
      }
      this.#steeringPointer = null;
      this.#tracker.releaseSteering(event.pointerId);
      resetWheelArtwork();
      steeringWheel.classList.remove('is-active');
      this.#emit();
    };
    steeringWheel.addEventListener('pointerup', releaseWheel);
    steeringWheel.addEventListener('pointercancel', releaseWheel);
    steeringWheel.addEventListener('lostpointercapture', releaseWheel);

    // --- Left/right steering arrows (shown only when selected in Gameplay Options) ---
    const arrowControls = document.createElement('div');
    arrowControls.className = 'touch-steering-arrows';
    arrowControls.setAttribute('role', 'group');
    arrowControls.setAttribute('aria-label', 'Touch steering arrows');
    const releaseArrowPointer = (pointerId: number, emit = true): void => {
      const button = this.#arrowPointers.get(pointerId);
      if (button === undefined) return;
      this.#arrowPointers.delete(pointerId);
      this.#tracker.releaseSteering(pointerId);
      button.classList.toggle('is-active', [...this.#arrowPointers.values()].includes(button));
      if (emit) this.#emit();
    };
    const steeringArrow = (glyph: string, steer: -1 | 1, ariaLabel: string): HTMLButtonElement => {
      const button = make('touch-steering-arrow', glyph, ariaLabel);
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        if (this.#arrowPointers.has(event.pointerId)) return;
        button.setPointerCapture?.(event.pointerId);
        this.#arrowPointers.set(event.pointerId, button);
        button.classList.add('is-active');
        this.#tracker.setSteering(event.pointerId, steer);
        this.#emit();
      });
      const release = (event: PointerEvent): void => {
        if (event.type === 'pointerup') this.#maybeLockLandscape(event);
        releaseArrowPointer(event.pointerId);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      return button;
    };
    const arrowLeft = steeringArrow('←', -1, 'Steer left');
    const arrowRight = steeringArrow('→', 1, 'Steer right');
    arrowControls.append(arrowLeft, arrowRight);

    // --- Pedals (right thumb / index) ---
    const pedal = (
      className: string,
      label: string,
      control: 'throttle' | 'brake' | 'handbrake' | 'boost',
    ): HTMLButtonElement => {
      const element = make(className, label, label);
      element.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        element.setPointerCapture?.(event.pointerId);
        element.classList.add('is-active');
        this.#tracker.setPressed(control, event.pointerId, true);
        this.#emit();
      });
      const release = (event: PointerEvent): void => {
        if (event.type === 'pointerup') {
          this.#maybeLockLandscape(event);
        }
        this.#tracker.setPressed(control, event.pointerId, false);
        element.classList.toggle('is-active', this.#tracker.snapshot()[control]);
        this.#emit();
      };
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('lostpointercapture', release);
      return element;
    };

    const pedals = document.createElement('div');
    pedals.className = 'touch-pedals';
    const brake = pedal('touch-pedal touch-pedal-brake', 'BRAKE', 'brake');
    const gas = pedal('touch-pedal touch-pedal-gas', 'GAS', 'throttle');
    pedals.append(brake, gas);
    const handbrake = pedal('touch-handbrake', 'HB', 'handbrake');
    const nitro = pedal('touch-boost', 'N₂O', 'boost');
    nitro.setAttribute('aria-label', 'Hold N2O boost while accelerating');
    nitro.title = 'Hold while accelerating to use N₂O boost.';

    // --- Utility buttons (top-right) ---
    const utilities = document.createElement('div');
    utilities.className = 'touch-utilities';
    const diagnosticsButton = make('touch-utility', '📊', 'Toggle diagnostics');
    diagnosticsButton.addEventListener('click', () => {
      diagnosticsButton.blur();
      this.#options.onCommand('toggleDiagnostics');
    });
    const cameraButton = make('touch-utility', '📷', 'Toggle camera');
    cameraButton.addEventListener('click', () => {
      cameraButton.blur();
      this.#options.onCommand('toggleCamera');
    });
    const resetButton = make('touch-utility', '↺', 'Reset car');
    resetButton.addEventListener('click', () => {
      resetButton.blur();
      this.#options.onCommand('reset');
    });
    const fullscreenButton = make('touch-utility', '⛶', 'Fullscreen landscape');
    fullscreenButton.addEventListener('click', (event) => {
      fullscreenButton.blur();
      void TouchControls.requestLandscape(event);
    });
    utilities.append(diagnosticsButton, cameraButton, resetButton, fullscreenButton);

    this.#root.append(steeringWheel, arrowControls, handbrake, nitro, pedals, utilities);

    // Release safety net: if an element ever misses its pointerup (capture quirks,
    // browser gesture interruptions), the window still hears the thumb lift and no
    // pedal can stick on. Element handlers run first; releasing twice is harmless.
    const releasePointer = (event: PointerEvent): void => {
      this.#tracker.setPressed('throttle', event.pointerId, false);
      this.#tracker.setPressed('brake', event.pointerId, false);
      this.#tracker.setPressed('handbrake', event.pointerId, false);
      this.#tracker.setPressed('boost', event.pointerId, false);
      this.#tracker.releaseSteering(event.pointerId);
      releaseArrowPointer(event.pointerId, false);
      if (this.#steeringPointer?.id === event.pointerId) {
        this.#steeringPointer = null;
        resetWheelArtwork();
      }
      const state = this.#tracker.snapshot();
      steeringWheel.classList.toggle(
        'is-active',
        this.#steeringPointer !== null || this.#arrowPointers.size > 0,
      );
      arrowLeft.classList.toggle(
        'is-active',
        [...this.#arrowPointers.values()].includes(arrowLeft),
      );
      arrowRight.classList.toggle(
        'is-active',
        [...this.#arrowPointers.values()].includes(arrowRight),
      );
      gas.classList.toggle('is-active', state.throttle);
      brake.classList.toggle('is-active', state.brake);
      handbrake.classList.toggle('is-active', state.handbrake);
      nitro.classList.toggle('is-active', state.boost);
      this.#emit();
    };
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    this.#windowListeners.push(() => {
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
    });
    // A hidden tab must never resume with a pedal held down.
    const releaseWhenHidden = (): void => {
      if (document.hidden) {
        this.#steeringPointer = null;
        this.#arrowPointers.clear();
        this.#tracker.releaseAll();
        resetWheelArtwork();
        steeringWheel.classList.remove('is-active');
        arrowLeft.classList.remove('is-active');
        arrowRight.classList.remove('is-active');
        gas.classList.remove('is-active');
        brake.classList.remove('is-active');
        handbrake.classList.remove('is-active');
        nitro.classList.remove('is-active');
        this.#emit();
      }
    };
    document.addEventListener('visibilitychange', releaseWhenHidden);
    this.#windowListeners.push(() => {
      document.removeEventListener('visibilitychange', releaseWhenHidden);
    });
  }

  #maybeLockLandscape(event: Event): void {
    const legacyDocument = document as Document & {
      readonly webkitFullscreenElement?: Element | null;
    };
    const webkitFullscreenElement = legacyDocument.webkitFullscreenElement;
    const isFullscreen =
      document.fullscreenElement !== null ||
      (webkitFullscreenElement !== undefined && webkitFullscreenElement !== null);
    if (this.#orientationAttempted || window.innerHeight <= window.innerWidth || !isFullscreen) {
      return;
    }
    this.#orientationAttempted = true;
    // pointerup retains touch activation on Android Chrome, unlike pointerdown.
    void TouchControls.requestLandscape(event);
  }
}
